//! Driver Manager commands (Task 8 - UX-25..27).
//!
//! Nguồn dữ liệu chính:
//! - WMI `Win32_PnPSignedDriver` (read-only, list drivers + signed status)
//! - WMI `Win32_PnPEntity` (device class, hardware ID)
//! - `pnputil /enum-drivers` (PowerShell `Get-WindowsDriver -Online`) cho backup
//!
//! Lưu ý:
//! - Một số operation (backup/restore) cần admin → detect qua error permission
//! - Driver date format WMI là `20210312000000.000000+000` → cần parse
//! - `DriverVersion` trên một số driver trống → fallback lấy từ INF file
//! - KHÔNG tự ý download driver từ web → chỉ check manifest local

use crate::domain::DriverInfo;
use crate::AppResult;
use std::process::Command as StdCommand;
use std::time::Instant;
use wmi::{COMLibrary, WMIConnection, WMIError};

// =================================================================
// WMI helpers
// =================================================================

fn wmi_conn() -> Result<WMIConnection, WMIError> {
    let com = COMLibrary::new()?;
    WMIConnection::new(com)
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

fn vbool(v: Option<&wmi::Variant>) -> bool {
    matches!(v, Some(wmi::Variant::Bool(true)))
}

/// Chuyển WMI datetime `20210312000000.000000+000` → `2021-03-12` (chỉ lấy date).
/// Trả về "" nếu parse fail hoặc rỗng.
fn parse_wmi_date(s: &str) -> String {
    if s.len() < 8 {
        return s.to_string();
    }
    format!("{}-{}-{}", &s[0..4], &s[4..6], &s[6..8])
}

// =================================================================
// List drivers (UX-25, UX-26)
// =================================================================

/// Lấy toàn bộ driver đã cài + signed. Sử dụng WMI `Win32_PnPSignedDriver`.
/// Joined với `Win32_PnPEntity` để lấp field `DeviceClass` (PnPSignedDriver
/// không có class, PnPEntity có nhưng không có DriverVersion).
pub fn list_drivers_inner() -> AppResult<Vec<DriverInfo>> {
    let conn = wmi_conn().map_err(|e| crate::AppError::Wmi(e.to_string()))?;

    // 1. Lấy map từ DeviceID → DeviceClass từ Win32_PnPEntity
    let entity_rows: Vec<std::collections::HashMap<String, wmi::Variant>> = conn
        .raw_query(
            "SELECT DeviceID, PNPClass, ClassGuid, Manufacturer, Description \
             FROM Win32_PnPEntity",
        )
        .map_err(|e| crate::AppError::Wmi(e.to_string()))?;

    let mut class_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut desc_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for row in entity_rows {
        let id = vstr(row.get("DeviceID"));
        let class = vstr(row.get("PNPClass"));
        let desc = vstr(row.get("Description"));
        if !id.is_empty() {
            if !class.is_empty() {
                class_map.insert(id.clone(), class);
            }
            if !desc.is_empty() {
                desc_map.insert(id, desc);
            }
        }
    }

    // 2. Lấy driver info từ Win32_PnPSignedDriver
    let driver_rows: Vec<std::collections::HashMap<String, wmi::Variant>> = conn
        .raw_query(
            "SELECT DeviceName, DeviceID, DeviceClass, DriverVersion, DriverDate, \
             DriverProviderName, InfName, IsSigned, Signer, HardwareID \
             FROM Win32_PnPSignedDriver",
        )
        .map_err(|e| crate::AppError::Wmi(e.to_string()))?;

    let drivers = driver_rows
        .into_iter()
        .map(|d| {
            let device_id = vstr(d.get("DeviceID"));
            let hardware_id = vstr(d.get("HardwareID"));
            // Fallback: nếu DeviceClass trống, lookup từ entity map
            let device_class = {
                let raw = vstr(d.get("DeviceClass"));
                if !raw.is_empty() {
                    raw
                } else {
                    class_map.get(&device_id).cloned().unwrap_or_default()
                }
            };
            // Fallback description cho DeviceName trống
            let device_name = {
                let raw = vstr(d.get("DeviceName"));
                if !raw.is_empty() {
                    raw
                } else {
                    desc_map.get(&device_id).cloned().unwrap_or_default()
                }
            };

            DriverInfo {
                device_name,
                device_class,
                current_version: vstr(d.get("DriverVersion")),
                driver_date: parse_wmi_date(&vstr(d.get("DriverDate"))),
                provider: vstr(d.get("DriverProviderName")),
                inf_name: vstr(d.get("InfName")),
                is_signed: vbool(d.get("IsSigned")),
                signer: vstr(d.get("Signer")),
                hardware_id,
                latest_version: None,
                update_available: false,
            }
        })
        .collect();

    Ok(drivers)
}

// =================================================================
// Summary (UX-25) - tổng quan theo class
// =================================================================

/// Tóm tắt drivers: tổng số, số có update, số unsigned, phân theo class.
pub fn driver_summary_inner(drivers: &[DriverInfo]) -> DriverSummary {
    let total = drivers.len();
    let unsigned = drivers.iter().filter(|d| !d.is_signed).count();
    let with_updates = drivers.iter().filter(|d| d.update_available).count();
    let old_drivers = drivers
        .iter()
        .filter(|d| {
            // Cũ hơn 2 năm → 730 ngày
            if d.driver_date.len() < 10 {
                return false;
            }
            let Ok(date) = chrono::NaiveDate::parse_from_str(&d.driver_date, "%Y-%m-%d") else {
                return false;
            };
            let now = chrono::Local::now().date_naive();
            (now - date).num_days() > 730
        })
        .count();

    // Group by class
    let mut by_class: std::collections::HashMap<String, u32> =
        std::collections::HashMap::new();
    for d in drivers {
        let key = if d.device_class.is_empty() {
            "Unknown".to_string()
        } else {
            d.device_class.clone()
        };
        *by_class.entry(key).or_insert(0) += 1;
    }
    let mut classes: Vec<DriverClassStat> = by_class
        .into_iter()
        .map(|(name, count)| DriverClassStat { name, count })
        .collect();
    classes.sort_by(|a, b| b.count.cmp(&a.count));

    DriverSummary {
        total,
        unsigned,
        with_updates,
        old_drivers,
        classes,
    }
}

// =================================================================
// Backup (UX-27) - pnputil export
// =================================================================

/// Export tất cả driver ra folder backup. Trả về summary.
/// CẦN ADMIN — sẽ fail với permission error nếu không chạy elevated.
pub fn backup_drivers_inner(target_dir: &str) -> AppResult<BackupReport> {
    if target_dir.is_empty() {
        return Err(crate::AppError::Other("target_dir trống".into()));
    }

    // Tạo folder nếu chưa có
    std::fs::create_dir_all(target_dir)
        .map_err(|e| crate::AppError::Io(format!("Không tạo được folder: {e}")))?;

    // pnputil /export-driver * "<target_dir>"
    // Trên PowerShell có thể dùng Export-WindowsDriver -Online -Destination ...
    let ps = format!(
        r#"
        try {{
            $count = (Export-WindowsDriver -Online -Destination '{}' -ErrorAction Stop |
                Measure-Object).Count
            Write-Output "OK $count"
        }} catch {{
            Write-Error $_.Exception.Message
            exit 1
        }}
        "#,
        target_dir.replace('\'', "''")
    );

    let start = Instant::now();
    let output = StdCommand::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &ps,
        ])
        .output()
        .map_err(|e| crate::AppError::Other(format!("Không chạy được PowerShell: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let duration_ms = start.elapsed().as_millis() as u64;

    if !output.status.success() {
        let lower = stderr.to_lowercase();
        if lower.contains("access is denied")
            || lower.contains("requires elevation")
            || lower.contains("administrator")
        {
            return Err(crate::AppError::Permission(
                "Backup driver cần quyền Administrator. Vui lòng restart app với Run as admin."
                    .into(),
            ));
        }
        return Err(crate::AppError::Other(format!("pnputil failed: {stderr}")));
    }

    // Parse "OK <count>"
    let exported = stdout
        .trim_start_matches("OK ")
        .trim()
        .parse::<u32>()
        .unwrap_or(0);

    // Tính size folder
    let total_size = dir_size(target_dir).unwrap_or(0);

    Ok(BackupReport {
        target_dir: target_dir.to_string(),
        exported_count: exported,
        total_size_bytes: total_size,
        duration_ms,
    })
}

/// Tính tổng size của folder (recursive).
fn dir_size(path: &str) -> std::io::Result<u64> {
    let mut total = 0u64;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            total += dir_size(&entry.path().to_string_lossy()).unwrap_or(0);
        } else {
            total += metadata.len();
        }
    }
    Ok(total)
}

// =================================================================
// Open backup folder in Explorer
// =================================================================

/// Mở folder backup bằng Explorer. Best-effort, không fail nếu lỗi.
pub fn open_backup_folder_inner(path: &str) -> AppResult<String> {
    if path.is_empty() {
        return Err(crate::AppError::Other("path trống".into()));
    }
    let output = StdCommand::new("explorer.exe")
        .arg(path)
        .output()
        .map_err(|e| crate::AppError::Other(format!("Không mở được Explorer: {e}")))?;
    if !output.status.success() {
        return Err(crate::AppError::Other(format!(
            "Explorer exit: {:?}",
            output.status.code()
        )));
    }
    Ok(format!("Đã mở {path}"))
}

// =================================================================
// Search drivers (filter client-side)
// =================================================================

/// Filter drivers theo query (search device name, class, provider, inf).
/// Filter thực hiện ở backend thay vì client để giảm payload khi list lớn.
pub fn search_drivers_inner(
    drivers: &[DriverInfo],
    query: &str,
    unsigned_only: bool,
) -> Vec<DriverInfo> {
    let q = query.to_lowercase();
    drivers
        .iter()
        .filter(|d| {
            if unsigned_only && d.is_signed {
                return false;
            }
            if q.is_empty() {
                return true;
            }
            d.device_name.to_lowercase().contains(&q)
                || d.device_class.to_lowercase().contains(&q)
                || d.provider.to_lowercase().contains(&q)
                || d.inf_name.to_lowercase().contains(&q)
        })
        .cloned()
        .collect()
}

// =================================================================
// Extra types
// =================================================================

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverClassStat {
    pub name: String,
    pub count: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverSummary {
    pub total: usize,
    pub unsigned: usize,
    pub with_updates: usize,
    pub old_drivers: usize,
    pub classes: Vec<DriverClassStat>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupReport {
    pub target_dir: String,
    pub exported_count: u32,
    pub total_size_bytes: u64,
    pub duration_ms: u64,
}

// =================================================================
// Thư viện driver theo HÃNG / DÒNG (Task 15)
// =================================================================

/// Báo cáo backup có phân loại theo hãng/dòng.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryBackupReport {
    /// Thư viện đã ghi vào.
    pub library_dir: String,
    /// Subdir của dòng máy hiện tại (vd `ACER/Nitro 5`).
    pub current_subdir: String,
    /// Tổng số driver đã export thành công.
    pub exported_count: u32,
    /// Số driver export lỗi.
    pub failed_count: u32,
    /// Tổng dung lượng.
    pub total_size_bytes: u64,
    /// Tổng số file.
    pub total_file_count: u32,
    /// Thời gian chạy.
    pub duration_ms: u64,
    /// Các nhóm đã tạo (đường dẫn tương đối → số driver).
    pub groups: Vec<LibraryGroupStat>,
    /// Danh sách lỗi (nếu có).
    pub failures: Vec<String>,
}

/// Thống kê 1 nhóm trong thư viện.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryGroupStat {
    pub path: String,
    pub driver_count: u32,
    pub size_bytes: u64,
    pub matches_current: bool,
}

/// Lấy hồ sơ máy (hãng + dòng sản phẩm).
#[tauri::command]
pub async fn get_machine_profile() -> AppResult<crate::machine_profile::MachineProfile> {
    tauri::async_runtime::spawn_blocking(crate::machine_profile::detect)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))
}

/// Xem trước cách driver sẽ được phân loại (không export).
#[tauri::command]
pub async fn preview_driver_library() -> AppResult<Vec<LibraryGroupStat>> {
    tauri::async_runtime::spawn_blocking(|| {
        let profile = crate::machine_profile::detect();
        let mut drivers = crate::driver_library::enum_store_drivers()
            .map_err(crate::AppError::Other)?;
        crate::driver_library::attach_device_names(&mut drivers);
        let grouped = crate::driver_library::group_drivers(&drivers, &profile);

        Ok(grouped
            .groups
            .into_iter()
            .map(|(path, list)| {
                let driver_count = list.len() as u32;
                let matches_current = path.eq_ignore_ascii_case(&profile.library_subdir());
                LibraryGroupStat {
                    path,
                    driver_count,
                    size_bytes: 0,
                    matches_current,
                }
            })
            .collect())
    })
    .await
    .map_err(|e| crate::AppError::Other(e.to_string()))?
}

/// Backup driver vào thư viện, phân loại theo `HÃNG/DÒNG`.
///
/// Không cần admin (dùng `pnputil /export-driver` thay vì `Export-WindowsDriver`).
#[tauri::command]
pub async fn backup_driver_library(
    library_dir: String,
    app: tauri::AppHandle,
) -> AppResult<LibraryBackupReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let start = Instant::now();
        let profile = crate::machine_profile::detect();
        let current_subdir = profile.library_subdir();

        let mut drivers = crate::driver_library::enum_store_drivers()
            .map_err(crate::AppError::Other)?;
        crate::driver_library::attach_device_names(&mut drivers);
        let grouped = crate::driver_library::group_drivers(&drivers, &profile);

        // Emit tiến trình để UI hiển thị realtime.
        let app_clone = app.clone();
        let mut progress = move |msg: &str| {
            use tauri::Emitter;
            let _ = app_clone.emit("driver-backup-progress", msg);
        };

        let stats = crate::driver_library::export_grouped(
            &grouped,
            &library_dir,
            &mut progress,
        )
        .map_err(crate::AppError::Other)?;

        let groups = crate::driver_library::scan_library(&library_dir, &current_subdir);

        Ok(LibraryBackupReport {
            library_dir,
            current_subdir,
            exported_count: stats.exported_count,
            failed_count: stats.failed_count,
            total_size_bytes: stats.total_size_bytes,
            total_file_count: stats.total_file_count,
            duration_ms: start.elapsed().as_millis() as u64,
            groups: groups
                .into_iter()
                .map(|g| LibraryGroupStat {
                    path: g.path,
                    driver_count: g.driver_count,
                    size_bytes: g.size_bytes,
                    matches_current: g.matches_current,
                })
                .collect(),
            failures: stats.failures,
        })
    })
    .await
    .map_err(|e| crate::AppError::Other(e.to_string()))?
}

/// Quét thư viện driver đã có trên đĩa.
#[tauri::command]
pub async fn scan_driver_library(library_dir: String) -> AppResult<Vec<LibraryGroupStat>> {
    tauri::async_runtime::spawn_blocking(move || {
        let profile = crate::machine_profile::detect();
        let current_subdir = profile.library_subdir();
        Ok(crate::driver_library::scan_library(&library_dir, &current_subdir)
            .into_iter()
            .map(|g| LibraryGroupStat {
                path: g.path,
                driver_count: g.driver_count,
                size_bytes: g.size_bytes,
                matches_current: g.matches_current,
            })
            .collect())
    })
    .await
    .map_err(|e| crate::AppError::Other(e.to_string()))?
}

/// Khôi phục driver từ 1 nhóm trong thư viện. **Cần admin.**
#[tauri::command]
pub async fn restore_driver_library_group(
    library_dir: String,
    group_path: String,
) -> AppResult<crate::driver_library::RestoreReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = std::path::Path::new(&library_dir)
            .join(&group_path)
            .to_string_lossy()
            .to_string();
        crate::driver_library::restore_group(&dir).map_err(crate::AppError::Other)
    })
    .await
    .map_err(|e| crate::AppError::Other(e.to_string()))?
}

// =================================================================
// Tauri commands
// =================================================================

#[tauri::command]
pub async fn list_drivers() -> AppResult<Vec<DriverInfo>> {
    tauri::async_runtime::spawn_blocking(list_drivers_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_driver_summary() -> AppResult<DriverSummary> {
    tauri::async_runtime::spawn_blocking(|| {
        let drivers = list_drivers_inner()?;
        Ok(driver_summary_inner(&drivers))
    })
    .await
    .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn search_drivers(
    query: String,
    unsigned_only: bool,
) -> AppResult<Vec<DriverInfo>> {
    tauri::async_runtime::spawn_blocking(move || {
        let drivers = list_drivers_inner()?;
        Ok(search_drivers_inner(&drivers, &query, unsigned_only))
    })
    .await
    .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn backup_drivers(target_dir: String) -> AppResult<BackupReport> {
    tauri::async_runtime::spawn_blocking(move || backup_drivers_inner(&target_dir))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn open_backup_folder(path: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || open_backup_folder_inner(&path))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}
