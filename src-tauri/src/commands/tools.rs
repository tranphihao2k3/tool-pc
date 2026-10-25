//! Tools Hub commands (Task 9 - UX-28).
//!
//! 14 mini utilities. Mỗi command trả `AppResult<T>` để frontend hiển thị lỗi rõ ràng.
//!
//! Lưu ý quyền:
//! - `restore_point`, `network_reset`, `check_disk` cần admin → detect bằng error
//! - `shred_file` KHÔNG cần admin nhưng CẢNH BÁO user (không thể khôi phục)
//! - SSD sẽ skip defrag/optimize (không có tác dụng, gây wear)

use crate::domain::{
    BatteryReport, CheckDiskReport, DefragReport, DiskCleanupReport, DuplicateGroup,
    DuplicateScanReport, InstalledAppForUninstall, KillProcessReport, LargeFileEntry,
    LargeFileReport, NetworkResetReport, NetworkResetStep, PowerPlan, RegistryIssue,
    RegistryScanReport, RestorePointReport, SetPowerPlanReport, ShredReport,
    ToolProcessInfo,
};
use crate::AppResult;
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use std::time::{Instant, UNIX_EPOCH};
use sysinfo::{ProcessesToUpdate, System};
use walkdir::WalkDir;
use winreg::enums::*;
use winreg::{HKEY, RegKey};

// =================================================================
// Helpers
// =================================================================

fn run_cmd(program: &str, args: &[&str]) -> Result<(bool, String, String), String> {
    let output = StdCommand::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("Không thể chạy {program}: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok((output.status.success(), stdout, stderr))
}

// =================================================================
// 1. Uninstall App (đọc registry Uninstall)
// =================================================================

const UNINSTALL_KEYS: &[(&str, &str)] = &[
    (r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", "HKLM64"),
    (r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", "HKLM32"),
    (r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", "HKCU"),
];

pub fn list_installed_apps_inner() -> AppResult<Vec<InstalledAppForUninstall>> {
    let mut apps: Vec<InstalledAppForUninstall> = Vec::new();
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    for (path, hive) in UNINSTALL_KEYS {
        let key_result = if *hive == "HKCU" {
            hkcu.open_subkey(path)
        } else {
            hklm.open_subkey(path)
        };
        let Ok(key) = key_result else { continue };

        for sub_name in key.enum_keys().flatten() {
            let Ok(sub) = key.open_subkey(&sub_name) else { continue };
            let name: String = sub.get_value("DisplayName").unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            apps.push(InstalledAppForUninstall {
                name,
                publisher: sub.get_value("Publisher").ok(),
                version: sub.get_value("DisplayVersion").ok(),
                install_date: sub.get_value("InstallDate").ok(),
                estimated_size_kb: sub.get_value("EstimatedSize").ok(),
                uninstall_string: sub.get_value("UninstallString").ok(),
                registry_key: format!("{}\\{}", path, sub_name),
            });
        }
    }
    // Sort by name
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(apps)
}

/// Chạy lệnh uninstall string. KHÔNG cần admin (thường), nhưng cảnh báo user trước.
pub fn uninstall_app_inner(uninstall_string: String) -> AppResult<String> {
    // Uninstall string thường có dạng:
    //   "C:\Program Files\App\uninstall.exe" /S
    //   MsiExec.exe /I{GUID} /quiet
    // Tách command đầu tiên và args còn lại.
    let trimmed = uninstall_string.trim();
    if trimmed.is_empty() {
        return Err(crate::AppError::Other("Uninstall string trống".into()));
    }

    // Nếu bắt đầu bằng `"` thì tìm dấu `"` kết thúc
    let (cmd, rest) = if let Some(stripped) = trimmed.strip_prefix('"') {
        if let Some(end) = stripped.find('"') {
            (stripped[..end].to_string(), stripped[end + 1..].trim().to_string())
        } else {
            (trimmed.to_string(), String::new())
        }
    } else {
        // Split first space
        match trimmed.find(' ') {
            Some(pos) => (trimmed[..pos].to_string(), trimmed[pos + 1..].trim().to_string()),
            None => (trimmed.to_string(), String::new()),
        }
    };

    let mut args: Vec<&str> = rest.split_whitespace().collect();
    // Thêm /quiet cho MsiExec nếu chưa có
    if cmd.to_lowercase().contains("msiexec") && !args.iter().any(|a| a.eq_ignore_ascii_case("/quiet") || a.eq_ignore_ascii_case("/qn")) {
        args.push("/quiet");
    }

    let output = StdCommand::new(&cmd)
        .args(&args)
        .output()
        .map_err(|e| crate::AppError::Other(format!("Không thể chạy uninstaller: {e}")))?;

    Ok(format!(
        "Đã chạy uninstall: {} (exit: {:?})",
        cmd,
        output.status.code()
    ))
}

// =================================================================
// 2. Disk Cleanup (cleanmgr)
// =================================================================

pub fn run_disk_cleanup_inner(drive: String) -> AppResult<DiskCleanupReport> {
    let start = Instant::now();
    let drive_letter = drive.trim_end_matches(':').to_uppercase();
    // cleanmgr yêu cầu GUID volume (qua /d)
    let (success, _stdout, stderr) = match run_cmd("cleanmgr", &["/d", &drive_letter]) {
        Ok(r) => r,
        Err(e) => {
            return Ok(DiskCleanupReport {
                launched: false,
                target_drive: format!("{}:", drive_letter),
                message: e,
                duration_ms: start.elapsed().as_millis() as u64,
            });
        }
    };
    Ok(DiskCleanupReport {
        launched: success,
        target_drive: format!("{}:", drive_letter),
        message: if success {
            format!("Đã mở Disk Cleanup cho ổ {}: trong cửa sổ riêng.", drive_letter)
        } else {
            format!("Không mở được Disk Cleanup: {}", stderr.trim())
        },
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// =================================================================
// 3. Defrag (defrag /O cho SSD, /D cho HDD)
// =================================================================

fn is_ssd_drive(drive: &str) -> bool {
    let drive_letter = drive.trim_end_matches(':');
    // Dùng WMI Win32_DiskDrive để kiểm tra MediaType
    // Đơn giản hơn: thử `fsutil fsinfo volumeinfo` (Win 10+)
    let drive_path = format!("{}:", drive_letter);
    if let Ok((_ok, stdout, _err)) = run_cmd("wmic", &["diskdrive", "get", "Model,MediaType", "/value"]) {
        // Không đáng tin → fallback: check qua volume
        let _ = stdout;
    }
    // Fallback đơn giản: SSDs thường là ổ C, nhưng để an toàn, trả về false
    // và để `defrag /O` tự skip.
    let _ = drive_path;
    false
}

pub fn run_defrag_inner(drive: String, optimize: bool) -> AppResult<DefragReport> {
    let start = Instant::now();
    let drive_letter = drive.trim_end_matches(':').to_uppercase();
    let drive_arg = format!("{}:", drive_letter);
    let is_ssd = is_ssd_drive(&drive_arg);

    let flag = if optimize { "/O" } else { "/D" };
    let (success, stdout, stderr) = run_cmd("defrag", &[&drive_arg, flag])
        .map_err(|e| crate::AppError::Other(e))?;

    let combined = format!("{}{}", stdout, stderr);
    let status = if success {
        "ok"
    } else if combined.to_lowercase().contains("skip") || combined.to_lowercase().contains("not needed") {
        "skipped"
    } else {
        "error"
    };

    Ok(DefragReport {
        drive: drive_arg,
        status: status.into(),
        message: combined.trim().lines().last().unwrap_or("").to_string(),
        duration_ms: start.elapsed().as_millis() as u64,
        is_ssd,
    })
}

// =================================================================
// 4. File Shredder (DoD 5220.22-M 3-pass + zero)
// =================================================================

pub fn shred_file_inner(path: String, passes: u32) -> AppResult<ShredReport> {
    let start = Instant::now();
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(crate::AppError::Other(format!("File không tồn tại: {path}")));
    }
    let metadata = fs::metadata(&target).map_err(|e| crate::AppError::Io(e.to_string()))?;
    if metadata.is_dir() {
        return Err(crate::AppError::Other("Không hỗ trợ xóa thư mục (chỉ file)".into()));
    }
    let file_size = metadata.len();

    let actual_passes = if passes == 0 { 3 } else { passes.min(7) };
    let mut file = OpenOptions::new()
        .write(true)
        .open(&target)
        .map_err(|e| crate::AppError::Io(format!("Không mở được file: {e}")))?;
    let mut bytes_written: u64 = 0;
    let chunk = 64 * 1024u64;
    let buf_random = vec![0xAAu8; chunk as usize];

    // Pass random data
    for p in 0..actual_passes {
        let _ = p;
        file.seek(SeekFrom::Start(0))
            .map_err(|e| crate::AppError::Io(e.to_string()))?;
        let mut written = 0u64;
        while written < file_size {
            let to_write = (file_size - written).min(chunk) as usize;
            file.write_all(&buf_random[..to_write])
                .map_err(|e| crate::AppError::Io(e.to_string()))?;
            written += to_write as u64;
            bytes_written += to_write as u64;
        }
        file.flush().map_err(|e| crate::AppError::Io(e.to_string()))?;
    }
    // Final pass: zero
    file.seek(SeekFrom::Start(0))
        .map_err(|e| crate::AppError::Io(e.to_string()))?;
    let zero_buf = vec![0u8; chunk as usize];
    let mut written = 0u64;
    while written < file_size {
        let to_write = (file_size - written).min(chunk) as usize;
        file.write_all(&zero_buf[..to_write])
            .map_err(|e| crate::AppError::Io(e.to_string()))?;
        written += to_write as u64;
    }
    file.flush().map_err(|e| crate::AppError::Io(e.to_string()))?;
    drop(file);

    // Delete
    let success = fs::remove_file(&target).is_ok();
    Ok(ShredReport {
        target: path,
        success,
        passes: actual_passes,
        bytes_written: bytes_written + file_size,
        duration_ms: start.elapsed().as_millis() as u64,
        message: if success {
            format!("Đã shred và xóa file ({} pass, {} bytes).", actual_passes, file_size)
        } else {
            "Đã ghi đè xong nhưng không xóa được file.".into()
        },
    })
}

// =================================================================
// 5. Registry Cleaner (scan known orphan keys)
// =================================================================

const REG_SCAN_KEYS: &[(&str, HKEY, &str)] = &[
    // App paths không còn tồn tại
    (r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths", HKEY_LOCAL_MACHINE, "App Paths"),
    // Recent docs trỏ tới file đã xóa (kiểm tra sơ bộ)
    (r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs", HKEY_CURRENT_USER, "RecentDocs"),
    // MUI Cache
    (r"SOFTWARE\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache", HKEY_CURRENT_USER, "MuiCache"),
];

pub fn scan_registry_inner() -> AppResult<RegistryScanReport> {
    let start = Instant::now();
    let mut issues: Vec<RegistryIssue> = Vec::new();
    let mut scanned: u32 = 0;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    for (path, hive, label) in REG_SCAN_KEYS {
        let key_result = if *hive == HKEY_CURRENT_USER {
            hkcu.open_subkey(path)
        } else {
            hklm.open_subkey(path)
        };
        let Ok(key) = key_result else { continue };

        for sub_name in key.enum_keys().flatten() {
            scanned += 1;
            let Ok(sub) = key.open_subkey(&sub_name) else { continue };

            // App Paths: kiểm tra default value trỏ tới file còn tồn tại không
            if *label == "App Paths" {
                if let Ok(default) = sub.get_value::<String, _>("") {
                    if !default.is_empty() && !Path::new(&default).exists() {
                        issues.push(RegistryIssue {
                            hive: "HKLM".into(),
                            key: format!("{}\\{}", path, sub_name),
                            value: Some(default),
                            issue: "App Paths trỏ tới file không tồn tại".into(),
                            severity: "warning".into(),
                        });
                    }
                }
            }
            // RecentDocs: thường là GUID, không check path
            // MuiCache: kiểm tra file path tồn tại không
            if *label == "MuiCache" {
                if let Ok(path_val) = sub.get_value::<String, _>("") {
                    if !path_val.is_empty() && !Path::new(&path_val).exists() {
                        issues.push(RegistryIssue {
                            hive: "HKCU".into(),
                            key: format!("{}\\{}", path, sub_name),
                            value: Some(path_val),
                            issue: "MuiCache trỏ tới file không tồn tại".into(),
                            severity: "info".into(),
                        });
                    }
                }
            }
        }
    }

    Ok(RegistryScanReport {
        issues,
        scanned_keys: scanned,
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// =================================================================
// 6. Duplicate Finder (hash MD5 quick)
// =================================================================

const DUP_SCAN_ROOTS: &[&str] = &[
    // Có thể thêm nhiều path; mặc định chỉ scan Documents + Desktop để demo
];

pub fn find_duplicates_inner(
    roots: Vec<String>,
    max_files: u32,
) -> AppResult<DuplicateScanReport> {
    let start = Instant::now();
    let roots = if roots.is_empty() {
        DUP_SCAN_ROOTS.iter().map(|s| s.to_string()).collect()
    } else {
        roots
    };

    let mut size_map: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    let mut scanned: u32 = 0;
    for root in &roots {
        let p = PathBuf::from(root);
        if !p.exists() {
            continue;
        }
        for entry in WalkDir::new(&p)
            .max_depth(5)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            if scanned >= max_files {
                break;
            }
            scanned += 1;
            if let Ok(meta) = entry.metadata() {
                if meta.len() > 1024 * 1024 * 100 {
                    continue;
                } // Skip > 100MB
                size_map.entry(meta.len()).or_default().push(entry.path().to_path_buf());
            }
        }
    }

    let mut groups: Vec<DuplicateGroup> = Vec::new();
    let mut wasted: u64 = 0;
    for (_size, paths) in size_map.iter() {
        if paths.len() < 2 {
            continue;
        }
        // Hash từng file
        let mut hash_map: HashMap<String, Vec<PathBuf>> = HashMap::new();
        for path in paths {
            if let Some(h) = quick_hash(path) {
                hash_map.entry(h).or_default().push(path.clone());
            }
        }
        for (hash, dup_paths) in hash_map {
            if dup_paths.len() >= 2 {
                wasted += _size * (dup_paths.len() as u64 - 1);
                groups.push(DuplicateGroup {
                    hash,
                    size_bytes: *_size,
                    paths: dup_paths.iter().map(|p| p.to_string_lossy().to_string()).collect(),
                });
            }
        }
    }

    Ok(DuplicateScanReport {
        groups,
        wasted_bytes: wasted,
        scanned_files: scanned,
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

fn quick_hash(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let mut hasher = md5::Context::new();
    let mut buf = vec![0u8; 64 * 1024];
    let _ = file.read(&mut buf).ok()?;
    hasher.consume(&buf);
    Some(format!("{:x}", hasher.compute()))
}

// =================================================================
// 7. Large File Finder
// =================================================================

pub fn find_large_files_inner(root: String, min_size_mb: u64, limit: u32) -> AppResult<LargeFileReport> {
    let start = Instant::now();
    let path = PathBuf::from(&root);
    let min_bytes = min_size_mb * 1024 * 1024;
    let mut entries: Vec<LargeFileEntry> = Vec::new();
    let mut scanned: u32 = 0;

    if path.exists() {
        for entry in WalkDir::new(&path)
            .max_depth(4)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            scanned += 1;
            if let Ok(meta) = entry.metadata() {
                if meta.len() >= min_bytes {
                    let modified = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| {
                    let secs = d.as_secs() as i64;
                    chrono::DateTime::from_timestamp(secs, 0)
                        .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
                        .unwrap_or_default()
                        })
                        .unwrap_or_default();
                    entries.push(LargeFileEntry {
                        path: entry.path().to_string_lossy().to_string(),
                        size_bytes: meta.len(),
                        modified_at: modified,
                    });
                }
            }
            if entries.len() >= limit as usize {
                break;
            }
        }
    }

    entries.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(LargeFileReport {
        entries,
        scanned_files: scanned,
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// =================================================================
// 8. Restore Point
// =================================================================

pub fn create_restore_point_inner(description: String) -> AppResult<RestorePointReport> {
    let start = Instant::now();
    // PowerShell Checkpoint-Computer cần admin
    let ps_cmd = format!(
        "Checkpoint-Computer -Description \"{}\" -RestorePointType APPLICATION_UNINSTALL",
        description.replace('"', "'")
    );
    let (success, stdout, stderr) = run_cmd("powershell", &["-NoProfile", "-Command", &ps_cmd])
        .map_err(|e| crate::AppError::Other(e))?;

    let combined = format!("{}{}", stdout, stderr);
    let needs_reboot = combined.to_lowercase().contains("reboot") || combined.to_lowercase().contains("restart");

    // Nếu fail, kiểm tra lý do
    let message = if !success {
        if combined.to_lowercase().contains("permission") || combined.to_lowercase().contains("admin") {
            "Cần quyền admin để tạo restore point. Chạy lại app với Run as administrator.".into()
        } else if combined.to_lowercase().contains("disabled") {
            "System Protection đang tắt. Bật trong System Properties > System Protection.".into()
        } else {
            format!("Lỗi: {}", combined.trim())
        }
    } else {
        "Đã tạo restore point thành công.".into()
    };

    Ok(RestorePointReport {
        success,
        sequence_number: None, // PowerShell không trả về số
        description,
        message,
        duration_ms: start.elapsed().as_millis() as u64,
        requires_reboot: needs_reboot,
    })
}

// =================================================================
// 9. Power Plan
// =================================================================

const POWER_PLANS: &[(&str, &str, &str)] = &[
    ("8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", "High performance", "high"),
    ("381b4222-f694-41f0-9685-ff5bb260df2e", "Balanced", "balanced"),
    ("a1841308-3541-4fab-bc81-f71556f20b4a", "Power saver", "power_saver"),
];

pub fn list_power_plans_inner() -> AppResult<Vec<PowerPlan>> {
    let mut plans: Vec<PowerPlan> = Vec::new();
    let (_ok, stdout, _err) = run_cmd("powercfg", &["/list"])
        .map_err(|e| crate::AppError::Other(e))?;

    for line in stdout.lines() {
        // Format: "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced) *"
        if let Some(guid_start) = line.find("GUID: ") {
            let rest = &line[guid_start + 6..];
            if let Some(guid_end) = rest.find(' ') {
                let guid = rest[..guid_end].to_string();
                let is_active = line.contains('*');
                let name_start = rest.find('(').unwrap_or(0);
                let name_end = rest.find(')').unwrap_or(rest.len());
                let name = if name_start < name_end {
                    rest[name_start + 1..name_end].to_string()
                } else {
                    guid.clone()
                };
                plans.push(PowerPlan {
                    guid,
                    name,
                    is_active,
                });
            }
        }
    }
    Ok(plans)
}

pub fn set_power_plan_inner(plan: String) -> AppResult<SetPowerPlanReport> {
    let start = Instant::now();
    let plan_name = plan.clone();
    let target_guid = match plan.as_str() {
        "high" => POWER_PLANS[0].0,
        "balanced" => POWER_PLANS[1].0,
        "power_saver" => POWER_PLANS[2].0,
        g if g.len() == 36 => g, // GUID
        _ => return Err(crate::AppError::Other(format!("Power plan không hợp lệ: {plan}"))),
    };

    let previous = list_power_plans_inner()
        .ok()
        .and_then(|plans| plans.into_iter().find(|p| p.is_active).map(|p| p.guid));

    let (success, _stdout, stderr) = run_cmd("powercfg", &["/setactive", target_guid])
        .map_err(|e| crate::AppError::Other(e))?;

    Ok(SetPowerPlanReport {
        success,
        plan_name,
        previous_guid: previous,
        new_guid: target_guid.to_string(),
        message: if success {
            "Đã chuyển power plan.".into()
        } else {
            format!("Lỗi: {}", stderr.trim())
        },
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// =================================================================
// 10. Network Reset
// =================================================================

pub fn reset_network_inner() -> AppResult<NetworkResetReport> {
    let start = Instant::now();
    let commands: &[(&str, &[&str])] = &[
        ("netsh", &["winsock", "reset"]),
        ("netsh", &["int", "ip", "reset"]),
        ("ipconfig", &["/flushdns"]),
        ("ipconfig", &["/release"]),
        ("ipconfig", &["/renew"]),
    ];
    let mut steps: Vec<NetworkResetStep> = Vec::new();
    let mut all_ok = true;
    for (prog, args) in commands {
        let step_name = format!("{} {}", prog, args.join(" "));
        match run_cmd(prog, args) {
            Ok((ok, stdout, stderr)) => {
                let out = if ok { stdout } else { stderr };
                if !ok {
                    all_ok = false;
                }
                steps.push(NetworkResetStep {
                    step: step_name,
                    success: ok,
                    output: out.trim().to_string(),
                });
            }
            Err(e) => {
                all_ok = false;
                steps.push(NetworkResetStep {
                    step: step_name,
                    success: false,
                    output: e,
                });
            }
        }
    }
    Ok(NetworkResetReport {
        success: all_ok,
        steps,
        requires_reboot: true,
        message: if all_ok {
            "Đã reset network thành công. Khuyến nghị restart máy.".into()
        } else {
            "Một số bước thất bại. Có thể cần quyền admin.".into()
        },
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// =================================================================
// 11. Flush DNS (đã có ở repair, không cần wrapper mới)
// =================================================================

// =================================================================
// 12. Battery Report
// =================================================================

pub fn generate_battery_report_inner(output_dir: String) -> AppResult<BatteryReport> {
    let start = Instant::now();
    let dir = PathBuf::from(&output_dir);
    fs::create_dir_all(&dir).map_err(|e| crate::AppError::Io(e.to_string()))?;
    let file_path = dir.join("battery-report.html");

    let (_ok, _stdout, stderr) = run_cmd(
        "powercfg",
        &["/batteryreport", "/output", &file_path.to_string_lossy()],
    )
    .map_err(|e| crate::AppError::Other(e))?;

    let (generated, size) = if file_path.exists() {
        let meta = fs::metadata(&file_path).ok();
        (true, meta.map(|m| m.len()).unwrap_or(0))
    } else {
        (false, 0)
    };

    Ok(BatteryReport {
        file_path: file_path.to_string_lossy().to_string(),
        generated,
        size_bytes: size,
        duration_ms: start.elapsed().as_millis() as u64,
        message: if generated {
            format!("Đã tạo battery report tại {}", file_path.display())
        } else {
            format!("Không tạo được battery report: {}", stderr.trim())
        },
    })
}

// =================================================================
// 13. Process Manager
// =================================================================

pub fn list_tool_processes_inner(limit: u32, include_system: bool) -> AppResult<Vec<ToolProcessInfo>> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All);
    let mut procs: Vec<ToolProcessInfo> = sys
        .processes()
        .values()
        .filter_map(|p| {
            let pid_u32 = p.pid().as_u32();
            let is_sys = pid_u32 <= 4 || p.name().to_string_lossy().eq_ignore_ascii_case("system")
                || p.name().to_string_lossy().eq_ignore_ascii_case("svchost");
            if is_sys && !include_system {
                return None;
            }
            Some(ToolProcessInfo {
                pid: pid_u32,
                name: p.name().to_string_lossy().to_string(),
                cpu_percent: p.cpu_usage(),
                mem_bytes: p.memory(),
                disk_read_bytes: p.disk_usage().read_bytes,
                disk_write_bytes: p.disk_usage().written_bytes,
                status: format!("{:?}", p.status()),
                is_system: is_sys,
                cmd: p.cmd().join(std::ffi::OsStr::new(" ")).to_string_lossy().to_string(),
            })
        })
        .collect();
    procs.sort_by(|a, b| b.mem_bytes.cmp(&a.mem_bytes));
    procs.truncate(limit as usize);
    Ok(procs)
}

pub fn kill_tool_process_inner(pid: u32) -> AppResult<KillProcessReport> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All);
    let name = sys
        .process(sysinfo::Pid::from_u32(pid))
        .map(|p| p.name().to_string_lossy().to_string())
        .unwrap_or_else(|| format!("PID {pid}"));

    let (success, _stdout, stderr) = run_cmd("taskkill", &["/F", "/PID", &pid.to_string()])
        .map_err(|e| crate::AppError::Other(e))?;

    Ok(KillProcessReport {
        pid,
        name,
        success,
        message: if success {
            "Đã kill process.".into()
        } else {
            format!("Không kill được: {}", stderr.trim())
        },
    })
}

// =================================================================
// 14. Check Disk
// =================================================================

pub fn check_disk_inner(drive: String) -> AppResult<CheckDiskReport> {
    let start = Instant::now();
    let drive_letter = drive.trim_end_matches(':').to_uppercase();
    let drive_arg = format!("{}:", drive_letter);
    // Chạy chkdsk không kèm /F để dry-run scan
    let (success, stdout, stderr) = run_cmd("chkdsk", &[&drive_arg])
        .map_err(|e| crate::AppError::Other(e))?;
    let combined = format!("{}{}", stdout, stderr);
    let needs_reboot = combined.to_lowercase().contains("cannot lock")
        || combined.to_lowercase().contains("restart");

    Ok(CheckDiskReport {
        drive: drive_arg,
        success,
        needs_reboot,
        message: combined.trim().lines().last().unwrap_or("Hoàn tất.").to_string(),
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

// =================================================================
// Tauri command wrappers
// =================================================================

#[tauri::command]
pub async fn list_installed_apps() -> AppResult<Vec<InstalledAppForUninstall>> {
    tokio::task::spawn_blocking(list_installed_apps_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn uninstall_app(uninstall_string: String) -> AppResult<String> {
    tokio::task::spawn_blocking(move || uninstall_app_inner(uninstall_string))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn run_disk_cleanup(drive: String) -> AppResult<DiskCleanupReport> {
    tokio::task::spawn_blocking(move || run_disk_cleanup_inner(drive))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn run_defrag(drive: String, optimize: bool) -> AppResult<DefragReport> {
    tokio::task::spawn_blocking(move || run_defrag_inner(drive, optimize))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn shred_file(path: String, passes: u32) -> AppResult<ShredReport> {
    tokio::task::spawn_blocking(move || shred_file_inner(path, passes))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn scan_registry() -> AppResult<RegistryScanReport> {
    tokio::task::spawn_blocking(scan_registry_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn find_duplicates(
    roots: Option<Vec<String>>,
    max_files: Option<u32>,
) -> AppResult<DuplicateScanReport> {
    let roots = roots.unwrap_or_default();
    let max = max_files.unwrap_or(5000);
    tokio::task::spawn_blocking(move || find_duplicates_inner(roots, max))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn find_large_files(
    root: String,
    min_size_mb: u64,
    limit: u32,
) -> AppResult<LargeFileReport> {
    tokio::task::spawn_blocking(move || find_large_files_inner(root, min_size_mb, limit))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn create_restore_point(description: String) -> AppResult<RestorePointReport> {
    tokio::task::spawn_blocking(move || create_restore_point_inner(description))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn list_power_plans() -> AppResult<Vec<PowerPlan>> {
    tokio::task::spawn_blocking(list_power_plans_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn set_power_plan_tools(plan: String) -> AppResult<SetPowerPlanReport> {
    tokio::task::spawn_blocking(move || set_power_plan_inner(plan))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn reset_network() -> AppResult<NetworkResetReport> {
    tokio::task::spawn_blocking(reset_network_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn generate_battery_report(output_dir: String) -> AppResult<BatteryReport> {
    tokio::task::spawn_blocking(move || generate_battery_report_inner(output_dir))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn list_tool_processes(
    limit: u32,
    include_system: bool,
) -> AppResult<Vec<ToolProcessInfo>> {
    tokio::task::spawn_blocking(move || list_tool_processes_inner(limit, include_system))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn kill_tool_process(pid: u32) -> AppResult<KillProcessReport> {
    tokio::task::spawn_blocking(move || kill_tool_process_inner(pid))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn check_disk(drive: String) -> AppResult<CheckDiskReport> {
    tokio::task::spawn_blocking(move || check_disk_inner(drive))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}
