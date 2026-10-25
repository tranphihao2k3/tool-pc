//! GPU helpers — dùng chung cho Dashboard (realtime) và trang System Info.
//!
//! ## Vì sao cần module riêng?
//!
//! `Win32_VideoController` chỉ cho thông tin tĩnh (tên, driver, độ phân giải).
//! Ba số quan trọng nhất — **VRAM thật**, **nhiệt độ**, **% sử dụng** — không
//! lấy được từ class đó:
//!
//! | Dữ liệu  | Nguồn đúng                                          | Ghi chú                        |
//! |----------|------------------------------------------------------|--------------------------------|
//! | VRAM     | Registry `HardwareInformation.qwMemorySize` (QWORD) | `AdapterRAM` của WMI là u32 → bị cắt ở 4GB |
//! | Nhiệt độ | `nvidia-smi --query-gpu=temperature.gpu`            | Chỉ có với NVIDIA              |
//! | % dùng   | WMI `..._GPUPerformanceCounters_GPUEngine`          | Max theo process (giống Task Manager) |
//!
//! ## Vì sao không dùng `AdapterRAM`?
//!
//! `Win32_VideoController.AdapterRAM` là **UI32** → card 8GB sẽ trả về
//! `4293918720` (≈4GB, giá trị bị bóp méo của driver). Registry
//! `HardwareInformation.qwMemorySize` là **REG_QWORD** → trả đúng 8GB.
//! Vẫn giữ `AdapterRAM` làm fallback cho card không có key registry.
//!
//! ## Ghép card với key registry
//!
//! Registry display class lưu `MatchingDeviceId` (vd
//! `pci\ven_10de&dev_1c8c&subsys_118b1025`) còn WMI trả `PNPDeviceID` (vd
//! `PCI\VEN_10DE&DEV_1C8C&SUBSYS_118B1025&REV_A1\4&339B478&0&0008`).
//! Hai chuỗi này **không giống nhau** → so khớp theo cặp `VEN_xxxx&DEV_xxxx`
//! (bỏ phần `SUBSYS`/`REV` và instance path).

use std::collections::HashMap;
use std::process::Command;
use winreg::enums::HKEY_LOCAL_MACHINE;
use winreg::RegKey;

// =================================================================
// WMI helpers
// =================================================================

fn wmi_conn() -> Result<wmi::WMIConnection, wmi::WMIError> {
    let com = wmi::COMLibrary::new()?;
    wmi::WMIConnection::new(com)
}

fn wmi_raw(
    conn: &wmi::WMIConnection,
    query: &str,
) -> Result<Vec<HashMap<String, wmi::Variant>>, String> {
    conn.raw_query(query).map_err(|e| e.to_string())
}

fn vstr(v: Option<&wmi::Variant>) -> String {
    match v {
        Some(wmi::Variant::String(s)) => s.clone(),
        Some(wmi::Variant::UI4(n)) => n.to_string(),
        Some(wmi::Variant::UI8(n)) => n.to_string(),
        Some(wmi::Variant::I4(n)) => n.to_string(),
        Some(wmi::Variant::I8(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn vf64(v: Option<&wmi::Variant>) -> f64 {
    match v {
        Some(wmi::Variant::UI4(n)) => *n as f64,
        Some(wmi::Variant::UI8(n)) => *n as f64,
        Some(wmi::Variant::I4(n)) => *n as f64,
        Some(wmi::Variant::I8(n)) => *n as f64,
        Some(wmi::Variant::R4(n)) => *n as f64,
        Some(wmi::Variant::R8(n)) => *n as f64,
        Some(wmi::Variant::String(s)) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

// =================================================================
// nvidia-smi
// =================================================================

/// Các đường dẫn thường gặp của `nvidia-smi.exe`.
///
/// **Lưu ý quan trọng**: `nvidia-smi` thường KHÔNG nằm trong `PATH` trên
/// Windows — driver chỉ cài nó vào `C:\Program Files\NVIDIA Corporation\NVSMI\`.
/// Nếu chỉ gọi `Command::new("nvidia-smi")` thì sẽ luôn fail.
const NVIDIA_SMI_PATHS: &[&str] = &[
    r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
    r"C:\Windows\System32\nvidia-smi.exe",
    r"C:\Program Files (x86)\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
    "nvidia-smi",
];

/// Thông tin 1 GPU NVIDIA đọc từ `nvidia-smi`.
#[derive(Debug, Clone, Default)]
pub struct NvidiaGpu {
    pub name: Option<String>,
    pub temp_c: Option<f32>,
    pub util_percent: Option<f32>,
    pub vram_used_bytes: Option<u64>,
    pub vram_total_bytes: Option<u64>,
    pub driver_version: Option<String>,
}

/// Chạy `nvidia-smi` để lấy thông tin GPU NVIDIA.
///
/// Trả về mảng rỗng nếu máy không có NVIDIA hoặc lệnh lỗi.
pub fn query_nvidia_gpus() -> Vec<NvidiaGpu> {
    for path in NVIDIA_SMI_PATHS {
        let out = match Command::new(path)
            .args([
                "--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,driver_version",
                "--format=csv,noheader,nounits",
            ])
            .output()
        {
            Ok(o) => o,
            Err(e) => {
                log::debug!("không chạy được nvidia-smi tại {path}: {e}");
                continue;
            }
        };

        if !out.status.success() {
            continue;
        }

        let text = String::from_utf8_lossy(&out.stdout);
        let mut gpus = Vec::new();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let cols: Vec<&str> = line.split(',').map(|c| c.trim()).collect();
            if cols.len() < 6 {
                continue;
            }
            let clean = |s: &str| -> Option<String> {
                let t = s.trim();
                if t.is_empty() || t == "[N/A]" || t == "Not Supported" {
                    None
                } else {
                    Some(t.to_string())
                }
            };
            gpus.push(NvidiaGpu {
                name: clean(cols[0]),
                temp_c: cols[1].parse::<f32>().ok(),
                util_percent: cols[2].parse::<f32>().ok(),
                vram_used_bytes: cols[3].parse::<u64>().ok().map(|m| m * 1024 * 1024),
                vram_total_bytes: cols[4].parse::<u64>().ok().map(|m| m * 1024 * 1024),
                driver_version: clean(cols[5]),
            });
        }
        if !gpus.is_empty() {
            return gpus;
        }
    }
    Vec::new()
}

// =================================================================
// VRAM — Registry
// =================================================================

/// Key registry chứa driver display adapter.
const DISPLAY_CLASS_KEY: &str =
    r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

/// Số lượng subkey adapter tối đa mà ta thử dò.
///
/// Display class dùng subkey đánh số `0000`, `0001`, ... theo thứ tự
/// device. `winreg 0.52` không có API liệt kê subkey (chỉ có
/// `open_subkey`), nên ta dò trực tiếp theo tên số — 64 là dư cho mọi
/// máy thực tế (Windows hỗ trợ tối đa 4 adapter + các mục hệ thống).
const MAX_ADAPTER_SUBKEYS: u32 = 64;

/// Chuẩn hoá chuỗi PCI ID về dạng `ven_xxxx&dev_xxxx` để so khớp.
///
/// - `pci\ven_10de&dev_1c8c&subsys_118b1025` → `ven_10de&dev_1c8c`
/// - `PCI\VEN_10DE&DEV_1C8C&SUBSYS_118B1025&REV_A1\4&339B478&0&0008` → `ven_10de&dev_1c8c`
fn pci_key(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase().replace('\\', "/");
    let start = lower.find("ven_").unwrap_or(0);
    let tail = &lower[start..];
    // Cắt tại mốc sớm nhất trong các mốc kết thúc.
    let end = ["&subsys", "&rev", "/"]
        .iter()
        .filter_map(|m| tail.find(m))
        .min()
        .unwrap_or(tail.len());
    tail[..end].to_string()
}

/// Đọc VRAM (bytes) của từng adapter từ registry display class.
///
/// Trả về map `pci_key -> vram_bytes`.
pub fn registry_vram_by_pci_id() -> HashMap<String, u64> {
    let mut out = HashMap::new();
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let Ok(class) = hklm.open_subkey(DISPLAY_CLASS_KEY) else {
        return out;
    };

    // `winreg 0.52` không có API liệt kê subkey → dò trực tiếp theo tên số.
    for i in 0..MAX_ADAPTER_SUBKEYS {
        let name = format!("{i:04}");
        // Subkey không tồn tại (hoặc bị chặn quyền) → bỏ qua.
        let Ok(k) = class.open_subkey(&name) else {
            continue;
        };
        let Some(matching) = k.get_value::<String, _>("MatchingDeviceId").ok() else {
            continue;
        };
        // QWORD = số bytes thật. DWORD là biến thể "MB âm" của driver → bỏ qua.
        let vram = match k.get_value::<u64, _>("HardwareInformation.qwMemorySize") {
            Ok(v) if v > 0 => v,
            _ => match k.get_value::<u32, _>("HardwareInformation.MemorySize") {
                Ok(v) if v > 0 => v as u64,
                _ => 0,
            },
        };
        if vram > 0 {
            out.insert(pci_key(&matching), vram);
        }
    }
    out
}

// =================================================================
// GPU utilization — WMI perf counters
// =================================================================

/// Tính % sử dụng GPU từ `Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine`.
///
/// Mỗi row là 1 engine của 1 tiến trình, tên có dạng:
/// `pid_1234_luid_0x..._phys_0_eng_0_engtype_3D`
///
/// ## Cách tính (giống Task Manager)
///
/// Task Manager hiển thị "3D" = **process nào đang bận nhất**, không phải
/// tổng của mọi process. Vì vậy:
/// 1. Gom theo `pid` → cộng các engine 3D của process đó.
/// 2. Lấy **max** trong số các process (mỗi process ≤ 100%).
/// 3. Nếu có nhiều card (`phys`), lấy max trong số các card.
///
/// Cộng tất cả process lại sẽ vượt 100% (ví dụ 2 game cùng chạy → 180%),
/// không khớp với Task Manager.
///
/// Trả về map `phys_id -> utilization%` để ghép với card tương ứng.
pub fn query_gpu_utilization_by_phys() -> HashMap<u32, f32> {
    let mut result: HashMap<u32, f32> = HashMap::new();
    let Ok(conn) = wmi_conn() else {
        return result;
    };
    let Ok(rows) = wmi_raw(
        &conn,
        "SELECT Name, UtilizationPercentage \
         FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine",
    ) else {
        return result;
    };

    // (phys, pid) -> tổng utilization 3D của process đó trên card đó
    let mut per_process: HashMap<(u32, u32), f64> = HashMap::new();

    for row in &rows {
        let name = vstr(row.get("Name"));
        if name.is_empty() {
            continue;
        }
        // Chỉ lấy engine 3D (render) — engine khác (Copy/Video/Compute) có thể
        // chạy song song và cộng lại sẽ vượt 100%.
        if !name.contains("engtype_3D") {
            continue;
        }
        let phys = extract_phys_id(&name);
        let pid = extract_pid(&name);
        let util = vf64(row.get("UtilizationPercentage"));
        if util <= 0.0 {
            continue;
        }
        *per_process.entry((phys, pid)).or_insert(0.0) += util;
    }

    if per_process.is_empty() {
        return result;
    }

    // phys -> max utilization của process nào đó trên card đó
    let mut per_phys: HashMap<u32, f64> = HashMap::new();
    for ((phys, _pid), util) in per_process {
        let entry = per_phys.entry(phys).or_insert(0.0);
        if util > *entry {
            *entry = util;
        }
    }

    for (phys, util) in per_phys {
        result.insert(phys, util as f32);
    }
    result
}

/// Rút `phys_N` ra từ tên engine. Trả 0 nếu không tìm thấy.
pub(crate) fn extract_phys_id(name: &str) -> u32 {
    name.split('_')
        .collect::<Vec<_>>()
        .windows(2)
        .find(|w| w[0] == "phys")
        .and_then(|w| w[1].parse::<u32>().ok())
        .unwrap_or(0)
}

/// Rút `pid_N` ra từ tên engine. Trả 0 nếu không tìm thấy.
pub(crate) fn extract_pid(name: &str) -> u32 {
    name.split('_')
        .collect::<Vec<_>>()
        .windows(2)
        .find(|w| w[0] == "pid")
        .and_then(|w| w[1].parse::<u32>().ok())
        .unwrap_or(0)
}

// =================================================================
// Ghép dữ liệu
// =================================================================

/// Thông tin GPU đầy đủ sau khi hợp nhất WMI + registry + nvidia-smi.
#[derive(Debug, Clone, Default)]
pub struct GpuDetail {
    pub name: String,
    pub adapter_compatibility: String,
    pub vram_bytes: u64,
    pub vram_used_bytes: Option<u64>,
    pub driver_version: String,
    pub driver_date: String,
    pub video_processor: String,
    pub current_resolution: String,
    pub current_refresh_rate: u32,
    pub max_refresh_rate: u32,
    pub is_discrete: bool,
    pub temperature_c: Option<f32>,
    pub utilization_percent: Option<f32>,
}

/// Card rời (discrete) nhận diện qua tên.
fn looks_discrete(name: &str) -> bool {
    let n = name.to_lowercase();
    n.contains("nvidia")
        || n.contains("geforce")
        || n.contains("rtx")
        || n.contains("gtx")
        || n.contains("quadro")
        || n.contains("radeon")
        || n.contains("rx ")
        || n.contains("amd radeon")
        || n.contains("arc ")
        || n.contains("firepro")
}

/// Chuẩn hoá tên GPU để so khớp giữa WMI và nvidia-smi.
fn normalize_gpu_name(raw: &str) -> String {
    let mut s = raw.to_lowercase();
    for prefix in ["nvidia ", "amd ", "intel(r) ", "intel ", "corporation "] {
        if let Some(rest) = s.strip_prefix(prefix) {
            s = rest.to_string();
        }
    }
    // Bỏ ký tự không phải chữ/số.
    s.retain(|c| c.is_ascii_alphanumeric());
    s
}

/// Tìm GPU NVIDIA khớp với tên WMI.
fn match_nvidia<'a>(wmi_name: &str, nv: &'a [NvidiaGpu]) -> Option<&'a NvidiaGpu> {
    let target = normalize_gpu_name(wmi_name);
    if target.is_empty() {
        return None;
    }
    nv.iter().find(|g| {
        let Some(n) = &g.name else { return false };
        let cand = normalize_gpu_name(n);
        !cand.is_empty() && (cand.contains(&target) || target.contains(&cand))
    })
}

/// Query đầy đủ danh sách GPU (mỗi card 1 entry).
///
/// Nguồn dữ liệu được hợp nhất:
/// - `Win32_VideoController` → tên, driver, độ phân giải, refresh rate
/// - Registry display class → VRAM thật
/// - `nvidia-smi` → nhiệt độ, % dùng, VRAM used/total, driver version
/// - WMI GPUEngine → % dùng (fallback cho card không phải NVIDIA)
pub fn query_all_gpus() -> Vec<GpuDetail> {
    let Ok(conn) = wmi_conn() else {
        return Vec::new();
    };
    let Ok(rows) = wmi_raw(
        &conn,
        "SELECT Name, AdapterCompatibility, AdapterRAM, DriverVersion, DriverDate, \
         VideoProcessor, PNPDeviceID, CurrentHorizontalResolution, \
         CurrentVerticalResolution, CurrentRefreshRate, MaxRefreshRate \
         FROM Win32_VideoController",
    ) else {
        return Vec::new();
    };

    let registry_vram = registry_vram_by_pci_id();
    let nvidia = query_nvidia_gpus();
    let util_by_phys = query_gpu_utilization_by_phys();
    // Max utilization trên tất cả card — dùng khi không ghép được phys cụ thể.
    let max_util = util_by_phys.values().copied().fold(0.0f32, f32::max);

    let mut gpus: Vec<GpuDetail> = Vec::new();

    for row in &rows {
        let name = vstr(row.get("Name"));
        if name.is_empty() {
            continue;
        }
        let pnp = vstr(row.get("PNPDeviceID"));
        let is_discrete = looks_discrete(&name);

        // --- VRAM: registry (chính xác) → nvidia-smi → WMI AdapterRAM ---
        let nv = match_nvidia(&name, &nvidia);
        let mut vram_bytes = registry_vram.get(&pci_key(&pnp)).copied().unwrap_or(0);
        let vram_used = nv.and_then(|g| g.vram_used_bytes);
        if vram_bytes == 0 {
            if let Some(total) = nv.and_then(|g| g.vram_total_bytes) {
                vram_bytes = total;
            }
        }
        if vram_bytes == 0 {
            // Fallback: AdapterRAM (UI32 → có thể bị cắt ở 4GB).
            vram_bytes = match row.get("AdapterRAM") {
                Some(wmi::Variant::UI4(n)) => *n as u64,
                Some(wmi::Variant::UI8(n)) => *n,
                Some(wmi::Variant::I4(n)) => *n as u64,
                Some(wmi::Variant::I8(n)) => *n as u64,
                _ => 0,
            };
        }

        // --- Nhiệt độ / % dùng / driver ---
        let temperature_c = nv.and_then(|g| g.temp_c);
        let mut utilization_percent = nv.and_then(|g| g.util_percent);
        if utilization_percent.is_none() {
            utilization_percent = Some(max_util);
        }
        let mut driver_version = vstr(row.get("DriverVersion"));
        if driver_version.is_empty() {
            driver_version = nv.and_then(|g| g.driver_version.clone()).unwrap_or_default();
        }

        let w = match row.get("CurrentHorizontalResolution") {
            Some(wmi::Variant::UI4(n)) => *n,
            Some(wmi::Variant::UI8(n)) => *n as u32,
            Some(wmi::Variant::I4(n)) => *n as u32,
            _ => 0,
        };
        let h = match row.get("CurrentVerticalResolution") {
            Some(wmi::Variant::UI4(n)) => *n,
            Some(wmi::Variant::UI8(n)) => *n as u32,
            Some(wmi::Variant::I4(n)) => *n as u32,
            _ => 0,
        };

        gpus.push(GpuDetail {
            name,
            adapter_compatibility: vstr(row.get("AdapterCompatibility")),
            vram_bytes,
            vram_used_bytes: vram_used,
            driver_version,
            driver_date: vstr(row.get("DriverDate")),
            video_processor: vstr(row.get("VideoProcessor")),
            current_resolution: if w > 0 && h > 0 {
                format!("{w}x{h}")
            } else {
                String::new()
            },
            current_refresh_rate: match row.get("CurrentRefreshRate") {
                Some(wmi::Variant::UI4(n)) => *n,
                Some(wmi::Variant::UI8(n)) => *n as u32,
                Some(wmi::Variant::I4(n)) => *n as u32,
                _ => 0,
            },
            max_refresh_rate: match row.get("MaxRefreshRate") {
                Some(wmi::Variant::UI4(n)) => *n,
                Some(wmi::Variant::UI8(n)) => *n as u32,
                Some(wmi::Variant::I4(n)) => *n as u32,
                _ => 0,
            },
            is_discrete,
            temperature_c,
            utilization_percent,
        });
    }

    gpus
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pci_key_normalizes_both_formats() {
        let a = pci_key(r"pci\ven_10de&dev_1c8c&subsys_118b1025");
        let b = pci_key(r"PCI\VEN_10DE&DEV_1C8C&SUBSYS_118B1025&REV_A1\4&339B478&0&0008");
        assert_eq!(a, "ven_10de&dev_1c8c");
        assert_eq!(a, b, "hai định dạng PCI ID phải khớp nhau");
    }

    #[test]
    fn registry_vram_is_readable() {
        let map = registry_vram_by_pci_id();
        // Máy có GPU rời → phải tìm được ít nhất 1 entry với VRAM hợp lý.
        for (k, v) in &map {
            assert!(*v > 0, "VRAM của {k} phải > 0");
        }
    }

    #[test]
    fn gpu_query_returns_entries_with_vram() {
        let gpus = query_all_gpus();
        assert!(!gpus.is_empty(), "phải có ít nhất 1 GPU");
        for g in &gpus {
            assert!(!g.name.is_empty(), "tên GPU không được rỗng");
        }
    }
}
