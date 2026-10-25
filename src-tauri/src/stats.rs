//! Stats collector — gom số liệu realtime chuẩn cho Dashboard (Task 13).
//!
//! ## Nguồn dữ liệu
//!
//! | Metric      | Nguồn                                              | Ghi chú                        |
//! |-------------|----------------------------------------------------|--------------------------------|
//! | CPU %       | `sysinfo` (`global_cpu_usage`)                     | Delta giữa 2 lần refresh        |
//! | CPU MHz     | `sysinfo` (`Cpu::frequency`)                       | Xung nhịp hiện tại              |
//! | Per-core    | `sysinfo` (`Cpu::cpu_usage`)                       | Mảng % từng core               |
//! | RAM         | `sysinfo` (`used_memory` / `total_memory`)          | Chuẩn Windows Task Manager      |
//! | Disk %      | `sysinfo` (`Disks`: total - available)             | Theo Ổ hệ thống (C:)            |
//! | Disk I/O    | WMI `Win32_PerfFormattedData_PerfDisk_PhysicalDisk`| Bytes/sec                       |
//! | CPU temp    | WMI `..._PerfFormattedData_Counters_ThermalZoneInformation` | Kelvin; không cần admin  |
//! | Network     | `sysinfo` (`Networks`: `received()` delta)         | Bytes/sec                       |
//! | GPU %       | module `gpu` (nvidia-smi + WMI `..._GPUEngine`)     | Max theo process (giống Task Manager) |
//! | GPU temp    | module `gpu` (`nvidia-smi`)                        | `None` với GPU không phải NVIDIA |
//! | GPU VRAM    | module `gpu` (registry `qwMemorySize`)             | Chính xác với card > 4GB          |
//!
//! ## Tối ưu
//!
//! WMI perf counters rất nặng (100-300ms/query) nên KHÔNG poll mỗi giây.
//! Collector chia 2 tầng:
//! - **Fast lane (mỗi 1s)**: CPU, RAM, Disk usage, Network — đều từ `sysinfo`.
//! - **Slow lane (mỗi 3s)**: Disk I/O, GPU usage, GPU temp, nhiệt độ CPU — qua WMI/nvidia-smi.
//!
//! Slow lane được cache lại và trả về nguyên giá trị cho các tick không có
//! dữ liệu mới, nên UI vẫn hiển thị liên tục.
//!
//! Phần GPU dùng chung module `crate::gpu` để số liệu ở Dashboard và trang
//! System Info luôn khớp nhau.

use crate::domain::RealtimeStats;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use sysinfo::{DiskKind, Disks, Networks, System};
use wmi::{COMLibrary, WMIConnection, WMIError};

/// Chu kỳ refresh slow lane (giây).
const SLOW_LANE_INTERVAL: Duration = Duration::from_secs(3);

// =================================================================
// Helpers
// =================================================================

fn wmi_conn() -> Result<WMIConnection, WMIError> {
    let com = COMLibrary::new()?;
    WMIConnection::new(com)
}

fn wmi_raw(
    conn: &WMIConnection,
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

/// Đọc ổ hệ thống (C:) từ biến môi trường `SystemDrive`.
fn system_drive_letter() -> String {
    std::env::var("SystemDrive")
        .ok()
        .map(|s| s.trim_end_matches('\\').to_string())
        .unwrap_or_else(|| "C:".to_string())
}

// =================================================================
// Disk I/O — WMI perf counters
// =================================================================

/// Tốc độ đọc/ghi ổ đĩa (bytes/sec) từ perf counter.
///
/// Lưu ý: class `Win32_PerfFormattedData_PerfDisk_PhysicalDisk` chỉ có
/// `DiskReadBytesPersec` / `DiskWriteBytesPersec` (không có bản `...PerSec`).
/// Query thừa property không tồn tại sẽ làm WMI trả lỗi → mất toàn bộ dữ liệu.
fn query_disk_io_wmi() -> Option<(f64, f64)> {
    let conn = wmi_conn().ok()?;
    let rows = wmi_raw(
        &conn,
        "SELECT Name, DiskReadBytesPersec, DiskWriteBytesPersec \
         FROM Win32_PerfFormattedData_PerfDisk_PhysicalDisk",
    )
    .ok()?;

    let mut total_read = 0.0f64;
    let mut total_write = 0.0f64;
    let mut found = false;
    for row in &rows {
        let name = vstr(row.get("Name"));
        if name == "_Total" {
            total_read = vf64(row.get("DiskReadBytesPersec"));
            total_write = vf64(row.get("DiskWriteBytesPersec"));
            found = true;
            break;
        }
    }
    if found {
        return Some((total_read, total_write));
    }

    // Fallback: cộng tất cả ổ vật lý (trừ _Total nếu có)
    for row in &rows {
        let name = vstr(row.get("Name"));
        if name.is_empty() || name.starts_with('_') {
            continue;
        }
        total_read += vf64(row.get("DiskReadBytesPersec"));
        total_write += vf64(row.get("DiskWriteBytesPersec"));
    }
    if total_read > 0.0 || total_write > 0.0 {
        Some((total_read, total_write))
    } else {
        None
    }
}

// =================================================================
// Collector
// =================================================================

/// Dữ liệu slow lane (WMI / nvidia-smi), cache lại giữa các tick.
#[derive(Debug, Clone, Default)]
struct SlowLaneData {
    disk_read_bps: f64,
    disk_write_bps: f64,
    gpu_percent: Option<f32>,
    gpu_temp_c: Option<f32>,
    gpu_name: Option<String>,
    gpu_vram_used_bytes: Option<u64>,
    gpu_vram_total_bytes: Option<u64>,
    cpu_temp_c: Option<f32>,
}

/// Collector giữ state giữa các tick để tính delta chính xác.
pub struct StatsCollector {
    sys: System,
    networks: Networks,
    disks: Disks,
    /// Thời điểm lần refresh network trước (để quy đổi delta → bytes/sec).
    last_net_ts: Instant,
    /// Slow lane cache.
    slow: SlowLaneData,
    /// Mốc thời gian lần refresh slow lane gần nhất.
    last_slow_ts: Instant,
}

impl StatsCollector {
    /// Tạo collector mới + warm-up (sysinfo cần 2 mẫu CPU để tính delta).
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_cpu_usage();
        // Warm-up ngắn để mẫu CPU đầu tiên hợp lệ.
        std::thread::sleep(Duration::from_millis(300));
        sys.refresh_cpu_usage();
        sys.refresh_memory();

        let networks = Networks::new_with_refreshed_list();
        let disks = Disks::new_with_refreshed_list();

        Self {
            sys,
            networks,
            disks,
            last_net_ts: Instant::now(),
            slow: SlowLaneData::default(),
            last_slow_ts: Instant::now() - SLOW_LANE_INTERVAL,
        }
    }

    /// Thu thập 1 mẫu stats đầy đủ.
    pub fn collect(&mut self) -> RealtimeStats {
        let now = Instant::now();

        // ---------------- Fast lane (mỗi 1s) ----------------
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();

        let cpu_percent = self.sys.global_cpu_usage();
        let per_core_load: Vec<f32> =
            self.sys.cpus().iter().map(|c| c.cpu_usage()).collect();
        let cpu_freq_mhz = self.sys.cpus().first().map(|c| c.frequency() as u32).unwrap_or(0);

        let ram_total = self.sys.total_memory();
        let ram_used = self.sys.used_memory();
        let ram_percent = if ram_total > 0 {
            (ram_used as f32 / ram_total as f32) * 100.0
        } else {
            0.0
        };

        // Disk: ưu tiên ổ hệ thống (C:)
        // `refresh_list()` enumerate volume (FindFirstVolumeW) — tốn hơn, chỉ
        // gọi 1 lần lúc khởi tạo. Mỗi tick chỉ `Disk::refresh()` để lấy
        // free space mới (GetDiskFreeSpaceExW — rất nhanh).
        for d in self.disks.list_mut() {
            d.refresh();
        }
        let sys_drive = system_drive_letter();
        let target = self
            .disks
            .list()
            .iter()
            .find(|d| {
                let mp = d.mount_point().to_string_lossy().to_uppercase();
                mp.starts_with(&sys_drive.to_uppercase())
            })
            .or_else(|| {
                self.disks
                    .list()
                    .iter()
                    .find(|d| d.kind() == DiskKind::HDD || d.kind() == DiskKind::SSD)
            })
            .or_else(|| self.disks.list().first());

        let (disk_total, disk_used) = match target {
            Some(d) => {
                let total = d.total_space();
                let avail = d.available_space();
                (total, total.saturating_sub(avail))
            }
            None => (0, 0),
        };
        let disk_percent = if disk_total > 0 {
            (disk_used as f32 / disk_total as f32) * 100.0
        } else {
            0.0
        };

        // Network: `received()` là delta kể từ lần refresh trước.
        self.networks.refresh();
        let elapsed = now.duration_since(self.last_net_ts).as_secs_f64().max(0.001);
        self.last_net_ts = now;
        let mut rx_bytes = 0u64;
        let mut tx_bytes = 0u64;
        for (_name, data) in self.networks.list() {
            rx_bytes = rx_bytes.saturating_add(data.received());
            tx_bytes = tx_bytes.saturating_add(data.transmitted());
        }
        let net_rx_bps = rx_bytes as f64 / elapsed;
        let net_tx_bps = tx_bytes as f64 / elapsed;

        // ---------------- Slow lane (mỗi 3s) ----------------
        if now.duration_since(self.last_slow_ts) >= SLOW_LANE_INTERVAL {
            self.last_slow_ts = now;
            self.refresh_slow_lane();
        }

        RealtimeStats {
            cpu_percent,
            ram_percent,
            ram_used_bytes: ram_used,
            ram_total_bytes: ram_total,
            gpu_percent: self.slow.gpu_percent,
            net_rx_bps,
            net_tx_bps,
            disk_read_bps: self.slow.disk_read_bps,
            disk_write_bps: self.slow.disk_write_bps,
            cpu_temp_c: self.slow.cpu_temp_c,
            timestamp_ms: now.elapsed().as_millis() as u64,
            disk_percent,
            disk_used_bytes: disk_used,
            disk_total_bytes: disk_total,
            disk_system_drive: sys_drive,
            cpu_freq_mhz,
            per_core_load,
            gpu_name: self.slow.gpu_name.clone(),
            gpu_temp_c: self.slow.gpu_temp_c,
            gpu_vram_used_bytes: self.slow.gpu_vram_used_bytes,
            gpu_vram_total_bytes: self.slow.gpu_vram_total_bytes,
        }
    }

    /// Refresh slow lane: Disk I/O + GPU + nhiệt độ CPU.
    fn refresh_slow_lane(&mut self) {
        // --- Nhiệt độ CPU (MSAcpi_ThermalZoneTemperature) ---
        self.refresh_cpu_temp();

        // --- Disk I/O ---
        if let Some((r, w)) = query_disk_io_wmi() {
            self.slow.disk_read_bps = r;
            self.slow.disk_write_bps = w;
        }

        // --- GPU: dùng module `gpu` chung để số liệu khớp với System Info ---
        self.refresh_gpu();
    }

    /// Refresh số liệu GPU (tên, %, nhiệt độ, VRAM).
    ///
    /// Ưu tiên card rời (discrete) — đó là card người dùng quan tâm.
    fn refresh_gpu(&mut self) {
        let gpus = crate::gpu::query_all_gpus();
        if gpus.is_empty() {
            return;
        }

        let primary = gpus
            .iter()
            .find(|g| g.is_discrete)
            .or_else(|| gpus.first())
            .unwrap();

        self.slow.gpu_name = Some(primary.name.clone());
        self.slow.gpu_temp_c = primary.temperature_c;
        self.slow.gpu_percent = primary.utilization_percent;
        self.slow.gpu_vram_total_bytes = if primary.vram_bytes > 0 {
            Some(primary.vram_bytes)
        } else {
            None
        };
        self.slow.gpu_vram_used_bytes = primary.vram_used_bytes;
    }

    /// Refresh nhiệt độ CPU (WMI chậm — gọi mỗi 3s).
    ///
    /// ## Vì sao không dùng `MSAcpi_ThermalZoneTemperature`?
    ///
    /// Class này nằm ở namespace `root\WMI` (không phải `root\cimv2`) và **cần
    /// quyền Administrator**. Query từ namespace mặc định sẽ luôn trả lỗi
    /// `Invalid class`, còn query `root\WMI` sẽ trả `Access denied` nếu app
    /// không chạy elevated → không dùng được cho app chạy user thường.
    ///
    /// ## Vì sao không dùng `sysinfo::Components`?
    ///
    /// Backend Windows của `sysinfo` cũng đọc `MSAcpi_ThermalZoneTemperature`
    /// (cùng vấn đề namespace + admin), **chỉ lấy zone đầu tiên**, hardcode
    /// label = `"Computer"`, và `temperature()` có thể trả **NaN**. NaN không
    /// serialize được bởi `serde_json` → làm hỏng cả event `realtime-stats`.
    ///
    /// ## Giải pháp
    ///
    /// Dùng `Win32_PerfFormattedData_Counters_ThermalZoneInformation` (nằm trong
    /// `root\cimv2`, **không cần admin**). Đơn vị là **Kelvin** (UI32).
    /// Lấy zone có nhiệt độ cao nhất là nhiệt độ board/CPU package.
    pub fn refresh_cpu_temp(&mut self) {
        let conn = match wmi_conn() {
            Ok(c) => c,
            Err(_) => return,
        };
        let rows = match wmi_raw(
            &conn,
            "SELECT Name, Temperature \
             FROM Win32_PerfFormattedData_Counters_ThermalZoneInformation",
        ) {
            Ok(r) => r,
            Err(e) => {
                log::debug!("đọc ThermalZoneInformation thất bại: {e}");
                return;
            }
        };

        // Name dạng "\\_TZ.TZ00", Temperature đơn vị Kelvin.
        let mut best: Option<f32> = None;
        for row in &rows {
            let raw = match row.get("Temperature") {
                Some(wmi::Variant::UI4(n)) => *n as f64,
                Some(wmi::Variant::UI8(n)) => *n as f64,
                Some(wmi::Variant::I4(n)) => *n as f64,
                Some(wmi::Variant::I8(n)) => *n as f64,
                _ => continue,
            };
            if raw <= 0.0 {
                continue;
            }
            let temp = (raw - 273.15) as f32;

            // Lọc giá trị vô lý (NaN / ngoài khoảng -50..150°C).
            if !temp.is_finite() || temp < -50.0 || temp > 150.0 {
                continue;
            }
            if best.map_or(true, |b| temp > b) {
                best = Some(temp);
            }
        }

        if let Some(temp) = best {
            self.slow.cpu_temp_c = Some(temp);
        }
    }
}

impl Default for StatsCollector {
    fn default() -> Self {
        Self::new()
    }
}

// =================================================================
// Tests — verify từng nguồn dữ liệu thực sự trả về giá trị hợp lệ.
// Chạy: `cargo test --lib stats`
// =================================================================
#[cfg(test)]
mod tests {
    use super::*;

    /// Mỗi query WMI phải chạy được (không lỗi) trên máy Windows thông thường.
    #[test]
    fn wmi_disk_io_query_runs() {
        // Query phải không lỗi. Giá trị có thể = 0 (không có I/O lúc chạy test).
        let conn = wmi_conn().expect("COM/WMI phải khởi tạo được");
        let rows = wmi_raw(
            &conn,
            "SELECT Name, DiskReadBytesPersec, DiskWriteBytesPersec \
             FROM Win32_PerfFormattedData_PerfDisk_PhysicalDisk",
        )
        .expect("query disk perf counter phải chạy được");
        assert!(!rows.is_empty(), "không có row nào cho disk perf counter");
        assert!(
            rows.iter().any(|r| vstr(r.get("Name")) == "_Total"),
            "phải có row _Total"
        );
    }

    #[test]
    fn wmi_gpu_engine_query_runs() {
        let conn = wmi_conn().expect("COM/WMI phải khởi tạo được");
        let rows = wmi_raw(
            &conn,
            "SELECT Name, UtilizationPercentage \
             FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine",
        )
        .expect("query GPU engine phải chạy được");
        // Máy không có GPU cũng không sao — chỉ cần query không lỗi.
        for r in &rows {
            let name = vstr(r.get("Name"));
            if name.contains("engtype_3D") {
                let util = vf64(r.get("UtilizationPercentage"));
                assert!(
                    (0.0..=100.0).contains(&util),
                    "utilization phải trong 0..100, nhận {util}"
                );
                assert!(
                    crate::gpu::extract_pid(&name) > 0,
                    "phải parse được pid từ {name}"
                );
                break;
            }
        }
    }

    #[test]
    fn wmi_thermal_zone_query_runs() {
        let conn = wmi_conn().expect("COM/WMI phải khởi tạo được");
        let rows = wmi_raw(
            &conn,
            "SELECT Name, Temperature \
             FROM Win32_PerfFormattedData_Counters_ThermalZoneInformation",
        )
        .expect("query thermal zone phải chạy được (root\\cimv2, không cần admin)");
        for r in &rows {
            let raw = vf64(r.get("Temperature"));
            if raw > 0.0 {
                let temp_c = raw - 273.15;
                assert!(
                    temp_c > -50.0 && temp_c < 150.0,
                    "nhiệt độ °C phải hợp lý, nhận {temp_c}"
                );
            }
        }
    }

    /// `MSAcpi_ThermalZoneTemperature` KHÔNG nằm trong `root\cimv2` → query
    /// trong namespace mặc định phải fail (nếu pass thì logic cũ còn sót).
    #[test]
    fn msaacpi_not_in_default_namespace() {
        let conn = wmi_conn().expect("COM/WMI phải khởi tạo được");
        let res = wmi_raw(
            &conn,
            "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature",
        );
        assert!(
            res.is_err(),
            "MSAcpi_ThermalZoneTemperature nên KHÔNG query được từ root\\cimv2"
        );
    }

    /// `nvidia-smi` phải được tìm thấy qua các đường dẫn cài đặt (nó thường
    /// KHÔNG nằm trong PATH).
    #[test]
    fn nvidia_smi_path_discovery() {
        let gpus = crate::gpu::query_nvidia_gpus();
        // Nếu máy có GPU NVIDIA thì phải đọc được ít nhất 1 entry.
        if crate::gpu::registry_vram_by_pci_id()
            .keys()
            .any(|k| k.starts_with("ven_10de"))
        {
            assert!(
                !gpus.is_empty(),
                "có GPU NVIDIA nhưng nvidia-smi không trả dữ liệu"
            );
        }
    }

    /// Collector phải trả về số liệu hợp lệ (không NaN — NaN sẽ làm hỏng
    /// `serde_json` và hỏng cả event `realtime-stats`).
    #[test]
    fn collector_returns_finite_values() {
        let mut c = StatsCollector::new();
        let s = c.collect();

        assert!(s.cpu_percent.is_finite(), "cpu_percent phải hữu hạn");
        assert!(s.ram_percent.is_finite(), "ram_percent phải hữu hạn");
        assert!(s.disk_percent.is_finite(), "disk_percent phải hữu hạn");
        assert!(s.net_rx_bps.is_finite(), "net_rx_bps phải hữu hạn");
        assert!(s.net_tx_bps.is_finite(), "net_tx_bps phải hữu hạn");
        assert!(s.disk_read_bps.is_finite(), "disk_read_bps phải hữu hạn");
        assert!(s.disk_write_bps.is_finite(), "disk_write_bps phải hữu hạn");

        if let Some(t) = s.cpu_temp_c {
            assert!(t.is_finite(), "cpu_temp_c phải hữu hạn");
            assert!(t > -50.0 && t < 150.0, "cpu_temp_c={t} không hợp lý");
        }
        if let Some(g) = s.gpu_percent {
            assert!(g.is_finite(), "gpu_percent phải hữu hạn");
            assert!((0.0..=100.0).contains(&g), "gpu_percent={g} ngoài 0..100");
        }

        assert!(s.ram_total_bytes > 0, "phải đọc được tổng RAM");
        assert!(s.disk_total_bytes > 0, "phải đọc được tổng dung lượng ổ");
    }

    /// Toàn bộ struct phải serialize được (NaN/Infinity sẽ làm serde_json fail).
    #[test]
    fn stats_are_json_serializable() {
        let mut c = StatsCollector::new();
        let s = c.collect();
        let json = serde_json::to_string(&s).expect("phải serialize được");
        assert!(json.contains("cpuPercent"));
    }
}
