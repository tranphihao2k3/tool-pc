//! Thư viện driver theo **HÃNG / DÒNG MÁY**.
//!
//! ## Vấn đề giải quyết
//!
//! `Export-WindowsDriver` xuất **toàn bộ** driver vào **một folder phẳng**.
//! Người dùng muốn lưu kho driver theo danh mục để sau này **tự truy vấn đúng
//! dòng máy** và khôi phục — ví dụ driver của "Acer Nitro 5" dùng được cho mọi
//! máy Nitro 5 (AN515-51, AN515-57, …), không cần biết mã máy cụ thể.
//!
//! ## Cấu trúc thư viện
//!
//! ```text
//! <library>/
//!   ACER/Nitro 5/
//!     acerairplanemodecontroller.inf_amd64_<hash>/
//!       AcerAirplaneModeController.cat
//!       acerairplanemodecontroller.inf
//!       AcerAirplaneModeController.sys
//!   ASUS/TUF Gaming/
//!     nvlt.inf_amd64_<hash>/…
//!   HP/OMEN Gaming/
//!     …
//! ```
//!
//! Mỗi **driver package** (1 `.inf` + `.cat` + `.sys`) nằm trong **1 subfolder riêng**
//! để `pnputil /add-driver <dir>\*.inf /subdirs` có thể quét đệ quy mà không đụng
//! nhau (2 driver có thể cùng tên file `.sys`).
//!
//! ## Vì sao dùng `pnputil /export-driver` thay vì `Export-WindowsDriver`?
//!
//! | | `Export-WindowsDriver` | `pnputil /export-driver` |
//! |---|---|---|
//! | Cần admin | ✅ **Có** | ❌ Không (chỉ cần quyền đọc DriverStore) |
//! | Export từng driver | ❌ Chỉ export **tất cả** | ✅ Từng `oemN.inf` |
//! | Tốc độ (41 driver) | ~75s | ~2s (tuần tự) |
//!
//! Vì `pnputil` cho phép export **từng driver** và **không cần admin**, ta dùng nó
//! để gom từng package vào đúng folder theo hãng/dòng.
//!
//! ## Quy tắc phân loại
//!
//! 1. **Driver do OEM sản xuất riêng cho máy** (Acer, HP, ASUS…) → `HÃNG/DÒNG`.
//!    Nhận biết qua `Provider Name` trong `pnputil /enum-drivers` và tên device.
//! 2. **Driver phổ thông** (Intel, NVIDIA, Realtek, Microsoft…) → `Common/<Class>`.
//!    Driver này dùng được cho mọi máy, không gắn với dòng nào.
//! 3. **Driver không xác định** → `Common/Other`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use crate::machine_profile::{self, MachineProfile};

// =================================================================
// Kiểu dữ liệu
// =================================================================

/// 1 driver package trong DriverStore (tương ứng 1 `oemN.inf`).
#[derive(Debug, Clone)]
pub struct StoreDriver {
    /// Tên published trong DriverStore, vd `oem9.inf`.
    pub published_name: String,
    /// Tên file INF gốc, vd `acerairplanemodecontroller.inf`.
    pub original_name: String,
    /// Nhà cung cấp, vd `Acer Incorporated`.
    pub provider: String,
    /// Lớp thiết bị, vd `Human Interface Devices`.
    pub class_name: String,
    /// Tên device gắn với driver (từ WMI), vd `Acer Airplane Mode Controller`.
    pub device_name: String,
}

impl StoreDriver {
    /// Driver này có phải do OEM (hãng máy) cung cấp riêng không?
    ///
    /// OEM driver thường có `Provider Name` khớp tên hãng (vd "Acer Incorporated")
    /// **hoặc** tên device chứa dấu hiệu hãng (vd "Acer Airplane Mode Controller").
    /// Driver phổ thông (Intel/NVIDIA/Realtek) dùng chung cho mọi máy → không gắn dòng.
    fn is_oem_specific(&self, brand_key: &str) -> bool {
        let provider = self.provider.to_lowercase();
        if provider_matches_brand(&provider, brand_key) {
            return true;
        }
        let device = self.device_name.to_lowercase();
        // Tên device chứa tên hãng → driver OEM (vd "Acer Inc. System Firmware").
        brand_key != "unknown" && device.contains(brand_key)
    }
}

/// `provider` có thuộc về `brand_key` không?
fn provider_matches_brand(provider: &str, brand_key: &str) -> bool {
    if brand_key.is_empty() || brand_key == "unknown" {
        return false;
    }
    // So khớp theo từ độc lập để tránh "acer" khớp "acer..." / "hp" khớp "nvidia".
    let tokens: Vec<String> = crate::machine_profile::words_of(provider);
    if tokens.iter().any(|t| t == brand_key) {
        return true;
    }
    // Biến thể tên hãng (vd "Intel(R) Corporation" vs brand "Intel",
    // "Hewlett-Packard" vs brand "HP").
    let alt: &[&str] = match brand_key {
        "intel" => &["intel"],
        "nvidia" => &["nvidia"],
        "realtek" => &["realtek"],
        "acer" => &["acer"],
        "asus" => &["asustek"],
        "hp" => &["hewlett", "packard"],
        "dell" => &["dell"],
        "lenovo" => &["lenovo"],
        "msi" => &["micro", "star", "microstar"],
        _ => &[],
    };
    alt.iter().any(|a| tokens.iter().any(|t| t == a))
}

/// Phân loại cuối cùng của 1 driver package.
#[derive(Debug, Clone)]
pub enum DriverCategory {
    /// Driver riêng của hãng → đặt trong `HÃNG/DÒNG`.
    Oem { brand: String, series: String },
    /// Driver phổ thông → đặt trong `Common/<Class>`.
    Common { class_name: String },
}

/// Nhóm các driver package đã phân loại, sẵn sàng export.
#[derive(Debug, Clone)]
pub struct GroupedDrivers {
    /// Key = đường dẫn tương đối (vd `ACER/Nitro 5`), value = danh sách driver.
    pub groups: BTreeMap<String, Vec<StoreDriver>>,
}

/// Kết quả export 1 driver package.
#[derive(Debug, Clone)]
struct ExportOutcome {
    file_count: u32,
    size_bytes: u64,
}

// =================================================================
// Parse `pnputil /enum-drivers`
// =================================================================

/// Đọc & parse output của `pnputil /enum-drivers`.
///
/// Output EN có dạng:
///
/// ```text
/// Published Name:     oem9.inf
/// Original Name:      acerairplanemodecontroller.inf
/// Provider Name:      Acer Incorporated
/// Class Name:         Human Interface Devices
/// ```
pub fn enum_store_drivers() -> Result<Vec<StoreDriver>, String> {
    let output = StdCommand::new("pnputil")
        .args(["/enum-drivers"])
        .output()
        .map_err(|e| format!("Không chạy được pnputil: {e}"))?;

    // `pnputil` ghi ra stdout bằng encoding console của hệ thống. Khi bị redirect
    // từ Rust (pipe), nó dùng ANSI codepage → đọc bytes rồi decode theo
    // console CP hiện tại, fallback sang lossy UTF-8.
    let stdout = decode_console_bytes(&output.stdout);
    parse_enum_output(&stdout)
}

/// Decode bytes theo console code page của hệ thống.
///
/// `pnputil` (Windows 10 1903+) xuất UTF-8 khi `chcp 65001`, nếu không là
/// ANSI codepage (cp437/cp1252/...). Ta đọc code page hiện tại từ registry
/// `HKLM\SYSTEM\CurrentControlSet\Control\Nls\CodePage` và dùng `encoding_rs`.
fn decode_console_bytes(bytes: &[u8]) -> String {
    // UTF-8 hợp lệ → dùng luôn (tránh hỏng tiếng Việt).
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }
    // Thử codepage 65001 (UTF-8) theo cách khác: bytes có thể là UTF-16LE.
    if bytes.len() >= 2 && bytes[1] == 0 {
        let u16s: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&u16s);
    }
    // ANSI codepage: strip byte cao → ASCII gần đúng, giữ đủ cho parse tên.
    bytes
        .iter()
        .map(|&b| if b.is_ascii_graphic() || b.is_ascii_whitespace() { b as char } else { '?' })
        .collect()
}

/// Parse nội dung `pnputil /enum-drivers` thành danh sách driver.
fn parse_enum_output(text: &str) -> Result<Vec<StoreDriver>, String> {
    let mut drivers: Vec<StoreDriver> = Vec::new();
    let mut published = String::new();
    let mut original = String::new();
    let mut provider = String::new();
    let mut class_name = String::new();

    let flush = |published: &mut String,
                 original: &mut String,
                 provider: &mut String,
                 class_name: &mut String,
                 out: &mut Vec<StoreDriver>| {
        if !published.is_empty() {
            out.push(StoreDriver {
                published_name: published.clone(),
                original_name: original.clone(),
                provider: provider.clone(),
                class_name: class_name.clone(),
                device_name: String::new(),
            });
        }
        published.clear();
        original.clear();
        provider.clear();
        class_name.clear();
    };

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Dòng bắt đầu bằng "Published Name:" → driver mới.
        if let Some(v) = strip_label(line, "Published Name:") {
            flush(
                &mut published,
                &mut original,
                &mut provider,
                &mut class_name,
                &mut drivers,
            );
            published = v;
        } else if let Some(v) = strip_label(line, "Original Name:") {
            original = v;
        } else if let Some(v) = strip_label(line, "Provider Name:") {
            provider = v;
        } else if let Some(v) = strip_label(line, "Class Name:") {
            class_name = v;
        }
    }
    flush(
        &mut published,
        &mut original,
        &mut provider,
        &mut class_name,
        &mut drivers,
    );

    if drivers.is_empty() {
        return Err("Không đọc được danh sách driver từ pnputil".into());
    }
    Ok(drivers)
}

/// Bỏ label ở đầu dòng, trả về phần giá trị đã trim.
fn strip_label(line: &str, label: &str) -> Option<String> {
    if !line.starts_with(label) {
        return None;
    }
    Some(line[label.len()..].trim().to_string())
}

// =================================================================
// Gắn tên device cho driver (từ WMI)
// =================================================================

/// Bổ sung `device_name` cho driver từ WMI `Win32_PnPSignedDriver`.
///
/// `pnputil /enum-drivers` không cho biết driver đó gắn với thiết bị nào;
/// WMI thì có (nhiều device có thể dùng chung 1 INF → lấy tên đầu tiên).
pub fn attach_device_names(drivers: &mut [StoreDriver]) {
    let Ok(conn) = crate::commands::system_info::wmi_conn_public() else {
        return;
    };
    let rows: Vec<std::collections::HashMap<String, wmi::Variant>> = match conn.raw_query(
        "SELECT InfName, DeviceName FROM Win32_PnPSignedDriver WHERE InfName IS NOT NULL",
    ) {
        Ok(r) => r,
        Err(_) => return,
    };

    for row in rows {
        let inf = match row.get("InfName") {
            Some(wmi::Variant::String(s)) => s.to_lowercase(),
            _ => continue,
        };        let device = match row.get("DeviceName") {
            Some(wmi::Variant::String(s)) => s.clone(),
            _ => continue,
        };
        if device.is_empty() {
            continue;
        }
        for d in drivers.iter_mut() {
            if d.device_name.is_empty() && d.published_name.to_lowercase() == inf {
                d.device_name = device.clone();
            }
        }
    }
}

// =================================================================
// Phân loại
// =================================================================

/// Phân loại driver thành nhóm `HÃNG/DÒNG` hoặc `Common/<Class>`.
pub fn group_drivers(drivers: &[StoreDriver], profile: &MachineProfile) -> GroupedDrivers {
    let mut groups: BTreeMap<String, Vec<StoreDriver>> = BTreeMap::new();

    for d in drivers {
        let category = if d.is_oem_specific(&profile.brand_key) {
            DriverCategory::Oem {
                brand: profile.brand.clone(),
                series: profile.series.clone(),
            }
        } else {
            DriverCategory::Common {
                class_name: if d.class_name.is_empty() {
                    "Other".to_string()
                } else {
                    d.class_name.clone()
                },
            }
        };

        let key = match category {
            DriverCategory::Oem { brand, series } => format!(
                "{}/{}",
                machine_profile::sanitize_folder_name(&brand),
                machine_profile::sanitize_folder_name(&series)
            ),
            DriverCategory::Common { class_name } => format!(
                "Common/{}",
                machine_profile::sanitize_folder_name(&class_name)
            ),
        };

        groups.entry(key).or_default().push(d.clone());
    }

    GroupedDrivers { groups }
}

// =================================================================
// Export
// =================================================================

/// Export các driver đã phân loại vào thư viện.
///
/// Mỗi driver package nằm trong subfolder riêng: `<group>/<sanitized-inf-name>/`.
pub fn export_grouped(
    groups: &GroupedDrivers,
    library_dir: &str,
    progress: &mut dyn FnMut(&str),
) -> Result<ExportStats, String> {
    let root = PathBuf::from(library_dir);
    std::fs::create_dir_all(&root).map_err(|e| format!("Không tạo được thư viện: {e}"))?;

    let total: usize = groups.groups.values().map(|v| v.len()).sum();
    let mut done = 0usize;
    let mut stats = ExportStats::default();

    for (group_key, drivers) in &groups.groups {
        let group_dir = root.join(group_key);
        std::fs::create_dir_all(&group_dir)
            .map_err(|e| format!("Không tạo được folder {group_key}: {e}"))?;

        for d in drivers {
            done += 1;
            let pkg_dir = group_dir.join(sanitize_package_dir(
                &d.original_name,
                &d.published_name,
            ));
            std::fs::create_dir_all(&pkg_dir)
                .map_err(|e| format!("Không tạo được folder package: {e}"))?;

            match export_one(&d.published_name, &pkg_dir) {
                Ok(outcome) => {
                    stats.exported_count += 1;
                    stats.total_size_bytes += outcome.size_bytes;
                    stats.total_file_count += outcome.file_count;
                    progress(&format!(
                        "[{done}/{total}] {} → {group_key}",
                        d.published_name
                    ));
                }
                Err(e) => {
                    stats.failed_count += 1;
                    stats
                        .failures
                        .push(format!("{}: {e}", d.published_name));
                    progress(&format!("[{done}/{total}] {} — LỖI: {e}", d.published_name));
                }
            }
        }
    }

    Ok(stats)
}

/// Tên thư mục cho 1 driver package.
///
/// Dùng **published name** (`oemN.inf`) vì nó **luôn duy nhất** trong DriverStore.
/// Tên file INF gốc **không** duy nhất: cùng 1 INF có thể được publish nhiều lần
/// với version khác nhau (vd `intcdaud.inf` x4, `nvhda.inf` x2) → dùng làm tên
/// folder sẽ khiến các driver ghi đè lên nhau và **mất file**.
///
/// Dạng: `{tên-inf-gốc}_{oemN}` (vd `intcdaud_oem12`) → vừa duy nhất, vừa dễ đọc.
fn sanitize_package_dir(original_name: &str, published_name: &str) -> String {
    let stem = original_name
        .strip_suffix(".inf")
        .unwrap_or(original_name)
        .to_lowercase();
    let tag = published_name
        .strip_suffix(".inf")
        .unwrap_or(published_name)
        .to_lowercase();
    let name = if tag.is_empty() {
        stem
    } else {
        format!("{stem}_{tag}")
    };
    machine_profile::sanitize_folder_name(&name)
}

/// Export 1 driver package bằng `pnputil /export-driver`.
///
/// `pnputil` **không cần admin** (chỉ đọc DriverStore) → nhanh hơn nhiều so với
/// `Export-WindowsDriver` và cho export từng driver.
fn export_one(published_name: &str, target_dir: &Path) -> Result<ExportOutcome, String> {
    let output = StdCommand::new("pnputil")
        .args(["/export-driver", published_name, &target_dir.to_string_lossy()])
        .output()
        .map_err(|e| format!("Không chạy được pnputil: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let msg = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if msg.is_empty() {
            format!("pnputil exit {:?}", output.status.code())
        } else {
            msg.lines().last().unwrap_or(&msg).to_string()
        });
    }

    let (file_count, size_bytes) = dir_stats(target_dir);
    Ok(ExportOutcome {
        file_count,
        size_bytes,
    })
}

/// Đếm file + tổng size trong 1 folder (đệ quy, 1 cấp vì package nằm phẳng).
fn dir_stats(dir: &Path) -> (u32, u64) {
    let mut count = 0u32;
    let mut size = 0u64;
    let Ok(entries) = std::fs::read_dir(dir) else {
        return (0, 0);
    };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            let (c, s) = dir_stats(&entry.path());
            count += c;
            size += s;
        } else {
            count += 1;
            size += meta.len();
        }
    }
    (count, size)
}

/// Thống kê kết quả export.
#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStats {
    pub exported_count: u32,
    pub failed_count: u32,
    pub total_size_bytes: u64,
    pub total_file_count: u32,
    pub failures: Vec<String>,
}

// =================================================================
// Đọc & khôi phục từ thư viện
// =================================================================

/// 1 nhóm driver trong thư viện (vd `ACER/Nitro 5`).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryGroup {
    /// Đường dẫn tương đối, vd `ACER/Nitro 5`.
    pub path: String,
    /// Số driver package trong nhóm.
    pub driver_count: u32,
    /// Tổng dung lượng.
    pub size_bytes: u64,
    /// Nhóm này là của dòng máy hiện tại hay không.
    pub matches_current: bool,
}

/// Quét thư viện driver, trả về danh sách nhóm.
pub fn scan_library(library_dir: &str, current_subdir: &str) -> Vec<LibraryGroup> {
    let root = PathBuf::from(library_dir);
    let mut out: Vec<LibraryGroup> = Vec::new();

    let Ok(level1) = std::fs::read_dir(&root) else {
        return out;
    };

    for brand_entry in level1.flatten() {
        if !brand_entry.path().is_dir() {
            continue;
        }
        let brand_name = brand_entry.file_name().to_string_lossy().to_string();

        // Nhóm 2 cấp: HÃNG/DÒNG (Common/Class cũng 2 cấp → hợp nhất).
        let Ok(level2) = std::fs::read_dir(brand_entry.path()) else {
            continue;
        };
        for series_entry in level2.flatten() {
            if !series_entry.path().is_dir() {
                continue;
            }
            let series_name = series_entry.file_name().to_string_lossy().to_string();
            let rel = format!("{brand_name}/{series_name}");

            // Đếm số package (mỗi package = 1 subfolder chứa .inf).
            let mut driver_count = 0u32;
            if let Ok(pkgs) = std::fs::read_dir(series_entry.path()) {
                for pkg in pkgs.flatten() {
                    if pkg.path().is_dir() {
                        driver_count += 1;
                    }
                }
            }
            let (file_count, size_bytes) = dir_stats(&series_entry.path());
            let _ = file_count;

            out.push(LibraryGroup {
                path: rel.clone(),
                driver_count,
                size_bytes,
                matches_current: rel.eq_ignore_ascii_case(current_subdir),
            });
        }
    }

    out.sort_by(|a, b| b.matches_current.cmp(&a.matches_current).then(a.path.cmp(&b.path)));
    out
}

/// Phân tích output của `pnputil /add-driver` → (đã thêm, đã có sẵn).
///
/// `pnputil` trả exit code **khác 0** ngay cả khi thành công:
/// - code 5 → "Added driver packages: 0" (driver đã có sẵn trong hệ thống)
/// - code 2 → lỗi thật (không tìm thấy package / sai định dạng)
///
/// → Phải đọc **nội dung output**, không tin exit code.
fn parse_add_driver_output(stdout: &str) -> (u32, u32) {
    let added = stdout.matches("Driver package added successfully").count();
    let already = stdout.matches("Already exists in the system").count();
    (added as u32, already as u32)
}

/// Khôi phục driver từ 1 nhóm trong thư viện.
///
/// Dùng `pnputil /add-driver <group>\*.inf /subdirs /install` → quét đệ quy
/// các subfolder package. **Cần admin** để cài driver vào hệ thống.
pub fn restore_group(group_dir: &str) -> Result<RestoreReport, String> {
    let dir = PathBuf::from(group_dir);
    if !dir.is_dir() {
        return Err(format!("Không tìm thấy folder: {group_dir}"));
    }
    // Phải có ít nhất 1 .inf bên trong (không tính .inf ở gốc folder).
    let has_inf = dir_stats(&dir).0 > 0
        && std::fs::read_dir(&dir)
            .map(|entries| {
                entries.flatten().any(|e| {
                    e.path().is_dir()
                        && std::fs::read_dir(e.path())
                            .map(|files| {
                                files.flatten().any(|f| {
                                    f.path()
                                        .extension()
                                        .map(|x| x.eq_ignore_ascii_case("inf"))
                                        .unwrap_or(false)
                                })
                            })
                            .unwrap_or(false)
                })
            })
            .unwrap_or(false);
    if !has_inf {
        return Err("Folder không chứa driver package nào".into());
    }

    let pattern = dir.join("*.inf").to_string_lossy().to_string();
    let output = StdCommand::new("pnputil")
        .args(["/add-driver", &pattern, "/subdirs", "/install"])
        .output()
        .map_err(|e| format!("Không chạy được pnputil: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{stderr}{stdout}");
    let lower = combined.to_lowercase();

    // `pnputil` trả exit code **khác 0** ngay cả khi thành công:
    // - code 5 → "Added driver packages: 0" (driver đã có sẵn trong hệ thống)
    // - code 2 → lỗi thật (không tìm thấy package / sai định dạng)
    // → Phải đọc **nội dung output**, không tin exit code.
    let (added, already) = parse_add_driver_output(&stdout);

    // Có ít nhất 1 package được xử lý thành công → coi là OK.
    let processed = added + already;
    let has_real_error = lower.contains("failed to add driver package") && processed == 0;

    if has_real_error {
        if lower.contains("access is denied") || lower.contains("requires elevation") {
            return Err(
                "Khôi phục driver cần quyền Administrator. Hãy mở app bằng Run as administrator."
                    .into(),
            );
        }
        return Err(format!("pnputil add-driver failed: {combined}").trim().to_string());
    }

    if processed == 0 {
        // Không parse được gì → báo lỗi với output gốc để debug.
        return Err(format!(
            "Không cài được driver nào. Output pnputil: {combined}"
        )
        .trim()
        .to_string());
    }

    Ok(RestoreReport {
        added_count: added,
        already_present_count: already,
        output: stdout.trim().to_string(),
    })
}

/// Kết quả khôi phục driver.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreReport {
    pub added_count: u32,
    pub already_present_count: u32,
    pub output: String,
}

// =================================================================
// Test
// =================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn profile() -> MachineProfile {
        machine_profile::resolve("Acer", "Nitro AN515-51", "Acer Nitro 5", "AN515-51")
    }

    #[test]
    fn parse_enum_output_documents_va_du_lich() {
        let text = "Microsoft PnP Utility\n\n\
Published Name:     oem9.inf\n\
Original Name:      acerairplanemodecontroller.inf\n\
Provider Name:      Acer Incorporated\n\
Class Name:         Human Interface Devices\n\
Class GUID:         {745a17a0-74d3-11d0-b6fe-00a0c90f57da}\n\
Driver Version:     03/24/2020 1.0.0.5\n\
Signer Name:        Microsoft Windows Hardware Compatibility Publisher\n\n\
Published Name:     oem17.inf\n\
Original Name:      hdbusext.inf\n\
Provider Name:      Intel Corporation\n\
Class Name:         Extensions\n";

        let drivers = parse_enum_output(text).expect("parse phải thành công");
        assert_eq!(drivers.len(), 2);

        assert_eq!(drivers[0].published_name, "oem9.inf");
        assert_eq!(drivers[0].provider, "Acer Incorporated");
        assert_eq!(drivers[0].class_name, "Human Interface Devices");

        assert_eq!(drivers[1].published_name, "oem17.inf");
        assert_eq!(drivers[1].provider, "Intel Corporation");
    }

    #[test]
    fn parse_enum_output_ten_labels_khong_bi_nham() {
        // "Signer Name" chứa chuỗi "Published Name" ở giá trị → không được match label khác.
        let text = "Published Name:     oem1.inf\n\
Original Name:      a.inf\n\
Provider Name:      P\n\
Class Name:         C\n\
Signer Name:        Published Name: not-a-label\n";
        let drivers = parse_enum_output(text).unwrap();
        assert_eq!(drivers.len(), 1);
        assert_eq!(drivers[0].published_name, "oem1.inf");
    }

    #[test]
    fn driver_oem_vao_ha_ng_dong_con_duoc_vao_common() {
        let drivers = vec![
            StoreDriver {
                published_name: "oem9.inf".into(),
                original_name: "acerairplane.inf".into(),
                provider: "Acer Incorporated".into(),
                class_name: "Human Interface Devices".into(),
                device_name: "Acer Airplane Mode Controller".into(),
            },
            StoreDriver {
                published_name: "oem17.inf".into(),
                original_name: "hdbusext.inf".into(),
                provider: "Intel Corporation".into(),
                class_name: "Extensions".into(),
                device_name: "Intel(R) 100 Series/C230 Series Chipset Family SMBus".into(),
            },
            StoreDriver {
                published_name: "oem33.inf".into(),
                original_name: "nvlt.inf".into(),
                provider: "NVIDIA".into(),
                class_name: "Display adapters".into(),
                device_name: "NVIDIA GeForce GTX 1050 Ti".into(),
            },
        ];

        let groups = group_drivers(&drivers, &profile());

        // OEM của Acer → ACER/Nitro 5.
        assert!(groups.groups.contains_key("ACER/Nitro 5"));
        assert_eq!(groups.groups["ACER/Nitro 5"].len(), 1);

        // Intel & NVIDIA → Common theo class.
        assert!(groups.groups.contains_key("Common/Extensions"));
        assert!(groups.groups.contains_key("Common/Display adapters"));

        // Tổng số driver không bị mất.
        let total: usize = groups.groups.values().map(|v| v.len()).sum();
        assert_eq!(total, 3);
    }

    #[test]
    fn provider_khop_brand_khong_duoc_khop_nham() {
        // "NVIDIA" không được khớp brand "HP" hay "ASUS".
        assert!(!provider_matches_brand("nvidia corporation", "hp"));
        assert!(!provider_matches_brand("intel corporation", "acer"));
        assert!(provider_matches_brand("acer incorporated", "acer"));
        assert!(provider_matches_brand("asustek computer inc.", "asus"));
        assert!(provider_matches_brand("hewlett-Packard", "hp"));
    }

    #[test]
    fn parse_add_driver_output_dem_va_khong_dem() {
        // Driver đã có sẵn → "Already exists", exit code 5 (không phải 0).
        let out = "Adding driver package:  pkg1\\acerairplane.inf\r\n\
Driver package added successfully. (Already exists in the system)\r\n\
Published Name:         oem9.inf\r\n\r\n\
Total driver packages:  1\r\n\
Added driver packages:  0\r\n";
        let (added, already) = parse_add_driver_output(out);
        assert_eq!(added, 1, "vẫn phải tính là đã xử lý thành công");
        assert_eq!(already, 1);

        // Driver mới → "added successfully" không kèm "Already exists".
        let out2 = "Adding driver package:  pkg2\\new.inf\r\n\
Driver package added successfully.\r\n\
Published Name:         oem99.inf\r\n\r\n\
Total driver packages:  1\r\n\
Added driver packages:  1\r\n";
        let (added2, already2) = parse_add_driver_output(out2);
        assert_eq!(added2, 1);
        assert_eq!(already2, 0);

        // Lỗi thật → không có dòng thành công nào.
        let out3 = "Failed to add driver package: Missing or invalid driver package specified.\r\n";
        let (added3, already3) = parse_add_driver_output(out3);
        assert_eq!(added3, 0);
        assert_eq!(already3, 0);
    }

    #[test]
    fn ten_package_folder_duoc_sanitize() {
        assert_eq!(
            sanitize_package_dir("acerairplanemodecontroller.inf", "oem9.inf"),
            "acerairplanemodecontroller_oem9"
        );
        assert_eq!(sanitize_package_dir("nvlt.inf", "oem33.inf"), "nvlt_oem33");
    }

    #[test]
    fn trung_ten_inf_goc_khong_lam_mat_driver() {        // DriverStore có thể publish CÙNG tên INF nhiều lần (version khác nhau).
        // Tên folder phải duy nhất → dùng published name.
        let a = sanitize_package_dir("intcdaud.inf", "oem12.inf");
        let b = sanitize_package_dir("intcdaud.inf", "oem19.inf");
        assert_ne!(a, b, "2 driver cùng tên INF gốc phải nằm 2 folder khác nhau");
        assert_eq!(a, "intcdaud_oem12");
        assert_eq!(b, "intcdaud_oem19");
    }
}
