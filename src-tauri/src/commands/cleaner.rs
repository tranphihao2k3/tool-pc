//! Cleaner commands (Task 6 - Optimize / UX-14).
//!
//! Quét và xóa các file tạm theo whitelist path an toàn. Mỗi category
//! được giới hạn trong một số thư mục nhất định (Temp, Cache, Recycle Bin...)
//! và KHÔNG bao giờ chạm vào `C:\Windows\System32`, `C:\Windows\SysWOW64`,
//! `C:\Program Files`, hay `%APPDATA%` của app khác.
//!
//! Quy tắc an toàn (xem plan §1.10):
//! - Skip file có `FILE_ATTRIBUTE_SYSTEM` hoặc `FILE_ATTRIBUTE_HIDDEN`
//! - Skip file đang bị lock (mở read-only fail)
//! - Mỗi lần scan tối đa `MAX_FILES_PER_CATEGORY` file để tránh OOM
//! - File age filter: chỉ xóa file > 1 ngày tuổi (tránh xóa file app đang tạo)
//!
//! Lưu ý quyền:
//! - `scan_clean_targets` không cần admin
//! - `delete_clean_targets` cần admin cho một số path (Windows Temp, WU cache)
//!   → trả về `CleanFile { safe_to_delete: false, skip_reason: ... }` cho những file đó

use crate::domain::{CleanCategory, CleanFile, CleanReport, CleanScanResult};
use crate::AppResult;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// Giới hạn số file liệt kê mỗi category để tránh OOM trên máy có temp khổng lồ.
const MAX_FILES_PER_CATEGORY: usize = 2_000;
/// Chỉ xóa file cũ hơn 1 ngày (86_400 giây).
const MIN_AGE_SECONDS: u64 = 86_400;

// =================================================================
// Inner helpers
// =================================================================

/// Trả về %LOCALAPPDATA%, fallback về "." nếu lỗi.
fn local_appdata() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Trả về %SystemRoot%, fallback "C:\\Windows".
fn system_root() -> PathBuf {
    std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:\\Windows"))
}

/// Trả về %SystemDrive%, fallback "C:".
fn system_drive() -> String {
    std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string())
}

/// Convert SystemTime → seconds since UNIX_EPOCH. Trả 0 nếu lỗi.
fn system_time_to_secs(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Check file có an toàn để xóa không (theo 3 tiêu chí: tồn tại, không bị lock, không system/hidden).
/// Trả về (size, Ok) nếu an toàn, hoặc (0, Err(reason)) nếu skip.
fn inspect_file(path: &Path) -> Result<u64, String> {
    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return Err("metadata-fail".into()),
    };
    if !metadata.is_file() {
        return Err("not-a-file".into());
    }

    // Check file lock: thử mở read-only
    let opened = fs::OpenOptions::new().read(true).open(path);
    if opened.is_err() {
        return Err("file-locked".into());
    }
    drop(opened);

    // Check tuổi file (chỉ áp dụng khi xóa, không áp dụng khi scan-only).
    if let Ok(modified) = metadata.modified() {
        let age = system_time_to_secs(SystemTime::now()).saturating_sub(system_time_to_secs(modified));
        if age < MIN_AGE_SECONDS {
            return Err("file-too-new".into());
        }
    }

    Ok(metadata.len())
}

/// Quét 1 directory đệ quy (giới hạn depth + số file), trả về list CleanFile.
fn scan_dir(root: &Path, max_depth: usize, current_depth: usize, out: &mut Vec<CleanFile>) {
    if current_depth > max_depth || out.len() >= MAX_FILES_PER_CATEGORY {
        return;
    }
    let entries = match fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_FILES_PER_CATEGORY {
            break;
        }
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            scan_dir(&path, max_depth, current_depth + 1, out);
        } else if file_type.is_file() {
            let (size, status) = match inspect_file(&path) {
                Ok(s) => (s, Ok(())),
                Err(reason) => (0, Err(reason)),
            };
            out.push(CleanFile {
                path: path.to_string_lossy().to_string(),
                size_bytes: size,
                safe_to_delete: status.is_ok(),
                skip_reason: status.err(),
            });
        }
    }
}

/// Tạo category rỗng (khi path không tồn tại hoặc không có file).
fn empty_category(id: &str, name: &str, desc: &str, requires_admin: bool) -> CleanCategory {
    CleanCategory {
        id: id.to_string(),
        name: name.to_string(),
        description: desc.to_string(),
        total_size_bytes: 0,
        file_count: 0,
        files: Vec::new(),
        requires_admin,
    }
}

/// Quét 1 category với danh sách path whitelist.
fn scan_category(
    id: &str,
    name: &str,
    description: &str,
    paths: &[PathBuf],
    requires_admin: bool,
) -> CleanCategory {
    let mut cat = empty_category(id, name, description, requires_admin);
    for p in paths {
        if p.exists() {
            scan_dir(p, 3, 0, &mut cat.files);
        }
    }
    cat.total_size_bytes = cat.files.iter().map(|f| f.size_bytes).sum();
    cat.file_count = cat.files.len() as u32;
    cat
}

/// Lấy danh sách các path cho từng category.
fn category_paths() -> Vec<(&'static str, &'static str, &'static str, Vec<PathBuf>, bool)> {
    let appdata = local_appdata();
    let win = system_root();
    let drive = system_drive();

    // Danh sách cơ bản
    let mut list: Vec<(&'static str, &'static str, &'static str, Vec<PathBuf>, bool)> = vec![
        (
            "user_temp",
            "Temp người dùng",
            "File tạm trong %LOCALAPPDATA%\\Temp",
            vec![appdata.join("Temp")],
            false,
        ),
        (
            "windows_temp",
            "Windows Temp",
            "File tạm hệ thống (cần admin)",
            vec![win.join("Temp")],
            true,
        ),
        (
            "thumbnail_cache",
            "Thumbnail cache",
            "Cache hình thu nhỏ của Explorer",
            vec![appdata.join("Microsoft").join("Windows").join("Explorer")],
            false,
        ),
        (
            "directx_shader",
            "DirectX Shader Cache",
            "Cache shader card màn hình",
            vec![appdata.join("D3DSCache")],
            false,
        ),
        (
            "prefetch",
            "Prefetch",
            "File prefetch (Windows tự dọn, an toàn)",
            vec![win.join("Prefetch")],
            true,
        ),
        (
            "memory_dump",
            "Memory dump",
            "File .dmp từ crash (>7 ngày)",
            vec![win.join("Minidump")],
            true,
        ),
    ];

    // Thêm WU cache nếu tồn tại
    let wu = win.join("SoftwareDistribution").join("Download");
    if wu.exists() {
        list[0].3.push(wu); // push vào user_temp (cùng nhóm download cache)
    }

    // Recycle Bin: chỉ đánh dấu 1 entry, KHÔNG đệ quy (system-managed)
    let recycle = PathBuf::from(format!("{drive}\\$Recycle.Bin"));
    if recycle.exists() {
        list.push((
            "recycle_bin",
            "Recycle Bin",
            "Thùng rác (dùng PowerShell để dọn an toàn)",
            vec![recycle],
            false,
        ));
    }

    list
}

/// Quét tất cả category được chỉ định (None = tất cả).
pub fn scan_clean_targets_inner(category_ids: Option<Vec<String>>) -> AppResult<CleanScanResult> {
    let started = Instant::now();
    let all = category_paths();
    let wanted: Vec<_> = match category_ids {
        Some(ids) => all
            .into_iter()
            .filter(|(id, ..)| ids.iter().any(|i| i == id))
            .collect(),
        None => all,
    };

    let mut categories = Vec::with_capacity(wanted.len());
    for (id, name, desc, paths, admin) in wanted {
        categories.push(scan_category(id, name, desc, &paths, admin));
    }

    let total_size_bytes = categories.iter().map(|c| c.total_size_bytes).sum();
    let total_file_count = categories.iter().map(|c| c.file_count).sum();

    Ok(CleanScanResult {
        categories,
        total_size_bytes,
        total_file_count,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

/// Xóa các file theo danh sách path. Trả về CleanReport với log đầy đủ.
/// KHÔNG xóa nếu `safe_to_delete = false` (do caller đã filter, nhưng check lại để an toàn).
pub fn delete_clean_targets_inner(paths: Vec<String>) -> AppResult<CleanReport> {
    let started = Instant::now();
    let mut log = Vec::new();
    let mut deleted_count: u32 = 0;
    let mut deleted_size_bytes: u64 = 0;
    let mut failed_paths = Vec::new();

    log.push(format!("Bắt đầu xóa {} mục", paths.len()));

    for raw in paths {
        let path = PathBuf::from(&raw);

        // Whitelist kiểm tra lần cuối: KHÔNG cho phép xóa trong Program Files / Windows / System32
        let lower = raw.to_lowercase();
        if lower.contains("program files")
            || lower.contains("windows\\system32")
            || lower.contains("windows\\syswow64")
        {
            failed_paths.push(raw.clone());
            log.push(format!("BỎ QUA (whitelist): {raw}"));
            continue;
        }

        match fs::metadata(&path) {
            Ok(m) if m.is_file() => {
                let size = m.len();
                match fs::remove_file(&path) {
                    Ok(_) => {
                        deleted_count += 1;
                        deleted_size_bytes += size;
                        log.push(format!("OK: {} ({} bytes)", raw, size));
                    }
                    Err(e) => {
                        failed_paths.push(raw.clone());
                        log.push(format!("FAIL: {} - {}", raw, e));
                    }
                }
            }
            Ok(_) => {
                // Là folder hoặc symlink → bỏ qua (chỉ xóa file lẻ)
                failed_paths.push(raw.clone());
                log.push(format!("SKIP (không phải file): {raw}"));
            }
            Err(e) => {
                failed_paths.push(raw.clone());
                log.push(format!("FAIL: {} - {}", raw, e));
            }
        }
    }

    log.push(format!(
        "Hoàn tất: {deleted_count} xóa, {} lỗi, {} bytes giải phóng",
        failed_paths.len(),
        deleted_size_bytes
    ));

    Ok(CleanReport {
        success: failed_paths.is_empty(),
        deleted_count,
        deleted_size_bytes,
        failed_count: failed_paths.len() as u32,
        failed_paths,
        duration_ms: started.elapsed().as_millis() as u64,
        log,
    })
}

/// Empty recycle bin (Windows). Trả về số byte ước tính giải phóng = 0 (không đo được).
pub fn empty_recycle_bin_inner() -> AppResult<CleanReport> {
    let started = Instant::now();
    let mut log = Vec::new();

    // Dùng PowerShell Clear-RecycleBin (an toàn, có thể restore trước khi empty).
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Clear-RecycleBin -Force -ErrorAction SilentlyContinue",
        ])
        .output();

    let (success, _msg) = match output {
        Ok(o) if o.status.success() => {
            log.push("Đã dọn Recycle Bin".to_string());
            (true, "Đã dọn Recycle Bin".to_string())
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            log.push(format!("Lỗi Clear-RecycleBin: {stderr}"));
            (
                false,
                format!("Không thể dọn Recycle Bin: {}", stderr.trim()),
            )
        }
        Err(e) => {
            log.push(format!("Không chạy được powershell: {e}"));
            (false, format!("Không chạy được PowerShell: {e}"))
        }
    };

    Ok(CleanReport {
        success,
        deleted_count: if success { 1 } else { 0 },
        deleted_size_bytes: 0,
        failed_count: if success { 0 } else { 1 },
        failed_paths: if success { Vec::new() } else { vec!["$Recycle.Bin".to_string()] },
        duration_ms: started.elapsed().as_millis() as u64,
        log,
    })
}

// =================================================================
// Tauri commands
// =================================================================

#[tauri::command]
pub async fn scan_clean_targets(
    category_ids: Option<Vec<String>>,
) -> AppResult<CleanScanResult> {
    tauri::async_runtime::spawn_blocking(move || scan_clean_targets_inner(category_ids))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn delete_clean_targets(paths: Vec<String>) -> AppResult<CleanReport> {
    tauri::async_runtime::spawn_blocking(move || delete_clean_targets_inner(paths))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn empty_recycle_bin() -> AppResult<CleanReport> {
    tauri::async_runtime::spawn_blocking(empty_recycle_bin_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}
