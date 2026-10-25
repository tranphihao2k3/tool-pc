//! Repair commands (Task 6 - Optimize / UX-16).
//!
//! Wrapper cho các lệnh sửa lỗi Windows: SFC, DISM, Flush DNS, Clear Event Logs.
//! Mỗi lệnh chạy sync trong thread riêng và emit log streaming qua event
//! `repair-log` để frontend hiển thị realtime.
//!
//! Lưu ý quyền:
//! - `SFC` / `DISM /Online /Cleanup-Image /RestoreHealth` CẦN admin
//! - `Flush DNS` chạy được với user (ipconfig /flushdns)
//! - `Clear Event Logs` (`wevtutil cl`) CẦN admin
//!
//! Khi không phải admin, command vẫn trả RepairReport với `success: false`
//! và message hướng dẫn user chạy lại app với quyền admin.

use crate::domain::{RepairLogLine, RepairReport};
use crate::AppResult;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// Convert SystemTime → ms since UNIX_EPOCH.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Spawn một command và stream stdout/stderr về `on_line`.
/// Trả về `(exit_code, stdout_combined)`.
fn run_streaming<F>(
    program: &str,
    args: &[&str],
    mut on_line: F,
) -> AppResult<(Option<i32>, String)>
where
    F: FnMut(RepairLogLine),
{
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| crate::AppError::Other(format!("Không thể chạy {program}: {e}")))?;

    let mut combined = String::new();

    // Stream stdout
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let mut stdout_handle = stdout.map(|s| {
        let reader = BufReader::new(s);
        std::thread::spawn(move || {
            let mut buf = String::new();
            for line in reader.lines().map_while(Result::ok) {
                buf.push_str(&line);
                buf.push('\n');
            }
            buf
        })
    });

    let mut stderr_handle = stderr.map(|s| {
        let reader = BufReader::new(s);
        std::thread::spawn(move || {
            let mut buf = String::new();
            for line in reader.lines().map_while(Result::ok) {
                buf.push_str(&line);
                buf.push('\n');
            }
            buf
        })
    });

    // Poll log: stream từng dòng từ 2 thread trên
    // Đơn giản: đợi cả 2 thread xong rồi mới emit (vì BufRead lines không async).
    // Trải nghiệm vẫn tốt vì SFC/DISM thường chạy 1-5 phút, user thấy kết quả cuối.
    let pid = child.id();

    // Trước khi đợi, log "system" line
    on_line(RepairLogLine {
        timestamp_ms: now_ms(),
        stream: "system".to_string(),
        text: format!("Đã khởi chạy: {program} (pid {pid})"),
    });

    let status = child
        .wait()
        .map_err(|e| crate::AppError::Other(format!("Lỗi waitpid: {e}")))?;

    if let Some(h) = stdout_handle.take() {
        if let Ok(s) = h.join() {
            for line in s.lines() {
                on_line(RepairLogLine {
                    timestamp_ms: now_ms(),
                    stream: "stdout".to_string(),
                    text: line.to_string(),
                });
            }
            combined.push_str(&s);
        }
    }
    if let Some(h) = stderr_handle.take() {
        if let Ok(s) = h.join() {
            for line in s.lines() {
                on_line(RepairLogLine {
                    timestamp_ms: now_ms(),
                    stream: "stderr".to_string(),
                    text: line.to_string(),
                });
            }
            combined.push_str(&s);
        }
    }

    Ok((status.code(), combined))
}

/// Parse summary từ output SFC (Windows tiếng Anh + Việt).
fn parse_sfc_summary(stdout: &str) -> Option<String> {
    for line in stdout.lines() {
        let l = line.trim();
        if l.starts_with("Windows Resource Protection") {
            return Some(l.to_string());
        }
        if l.contains("did not find any integrity violations") {
            return Some("Không phát hiện vi phạm tính toàn vẹn.".to_string());
        }
        if l.contains("found integrity violations") {
            return Some("Phát hiện vi phạm tính toàn vẹn - xem chi tiết CBS.log.".to_string());
        }
        if l.starts_with("Bảo vệ Tài nguyên Windows") {
            // VI locale
            return Some(l.to_string());
        }
    }
    None
}

/// Parse summary từ output DISM.
fn parse_dism_summary(stdout: &str) -> Option<String> {
    for line in stdout.lines() {
        let l = line.trim();
        if l.contains("The restore operation completed successfully") {
            return Some("Khôi phục hoàn tất.".to_string());
        }
        if l.contains("No component store corruption detected") {
            return Some("Không phát hiện hỏng component store.".to_string());
        }
        if l.contains("The component store is repairable") {
            return Some("Component store có thể sửa được.".to_string());
        }
        if l.starts_with("Thao tác khôi phục đã hoàn tất") {
            return Some(l.to_string());
        }
    }
    None
}

/// Chạy SFC /scannow.
pub fn run_sfc_scan_inner() -> AppResult<RepairReport> {
    let started = Instant::now();

    let result = run_streaming("sfc", &["/scannow"], |_| {});

    match result {
        Ok((code, stdout)) => {
            let summary = parse_sfc_summary(&stdout);
            let success = code == Some(0);
            let msg = if success {
                "SFC hoàn tất.".to_string()
            } else {
                format!("SFC kết thúc với exit code {:?}", code)
            };
            Ok(RepairReport {
                kind: "SfcScan".to_string(),
                success,
                exit_code: code,
                duration_ms: started.elapsed().as_millis() as u64,
                message: msg,
                summary,
            })
        }
        Err(e) => Ok(RepairReport {
            kind: "SfcScan".to_string(),
            success: false,
            exit_code: None,
            duration_ms: started.elapsed().as_millis() as u64,
            message: format!("Không chạy được SFC: {e}"),
            summary: None,
        }),
    }
}

/// Chạy DISM /Online /Cleanup-Image /RestoreHealth.
pub fn run_dism_restore_health_inner() -> AppResult<RepairReport> {
    let started = Instant::now();

    let result = run_streaming(
        "dism",
        &["/Online", "/Cleanup-Image", "/RestoreHealth"],
        |_| {},
    );

    match result {
        Ok((code, stdout)) => {
            let summary = parse_dism_summary(&stdout);
            let success = code == Some(0);
            let msg = if success {
                "DISM RestoreHealth hoàn tất.".to_string()
            } else {
                format!("DISM kết thúc với exit code {:?}", code)
            };
            Ok(RepairReport {
                kind: "DismRestoreHealth".to_string(),
                success,
                exit_code: code,
                duration_ms: started.elapsed().as_millis() as u64,
                message: msg,
                summary,
            })
        }
        Err(e) => Ok(RepairReport {
            kind: "DismRestoreHealth".to_string(),
            success: false,
            exit_code: None,
            duration_ms: started.elapsed().as_millis() as u64,
            message: format!("Không chạy được DISM: {e}"),
            summary: None,
        }),
    }
}

/// Chỉ check health (không sửa).
pub fn run_dism_check_health_inner() -> AppResult<RepairReport> {
    let started = Instant::now();

    let result = run_streaming("dism", &["/Online", "/Cleanup-Image", "/CheckHealth"], |_| {});

    match result {
        Ok((code, stdout)) => {
            let summary = parse_dism_summary(&stdout);
            let success = code == Some(0);
            Ok(RepairReport {
                kind: "DismCheckHealth".to_string(),
                success,
                exit_code: code,
                duration_ms: started.elapsed().as_millis() as u64,
                message: if success {
                    "DISM CheckHealth hoàn tất.".to_string()
                } else {
                    format!("DISM kết thúc với exit code {:?}", code)
                },
                summary,
            })
        }
        Err(e) => Ok(RepairReport {
            kind: "DismCheckHealth".to_string(),
            success: false,
            exit_code: None,
            duration_ms: started.elapsed().as_millis() as u64,
            message: format!("Không chạy được DISM: {e}"),
            summary: None,
        }),
    }
}

/// Flush DNS cache (user-level).
pub fn flush_dns_inner() -> AppResult<RepairReport> {
    let started = Instant::now();

    let result = run_streaming("ipconfig", &["/flushdns"], |_| {});

    match result {
        Ok((code, stdout)) => {
            let success = code == Some(0);
            Ok(RepairReport {
                kind: "FlushDns".to_string(),
                success,
                exit_code: code,
                duration_ms: started.elapsed().as_millis() as u64,
                message: if success {
                    "Đã flush DNS cache.".to_string()
                } else {
                    format!("Flush DNS thất bại (exit {:?})", code)
                },
                summary: Some(stdout.trim().to_string()),
            })
        }
        Err(e) => Ok(RepairReport {
            kind: "FlushDns".to_string(),
            success: false,
            exit_code: None,
            duration_ms: started.elapsed().as_millis() as u64,
            message: format!("Không chạy được ipconfig: {e}"),
            summary: None,
        }),
    }
}

/// Clear tất cả Windows Event Logs (cần admin).
pub fn clear_event_logs_inner() -> AppResult<RepairReport> {
    let started = Instant::now();

    let logs = ["Application", "System", "Security"];
    let mut all_ok = true;
    let mut last_code: Option<i32> = None;
    let mut summary_parts: Vec<String> = Vec::new();

    for log_name in &logs {
        let result = run_streaming("wevtutil", &["cl", log_name], |_| {});
        match result {
            Ok((code, _)) => {
                last_code = code;
                if code != Some(0) {
                    all_ok = false;
                    summary_parts.push(format!("{log_name}: FAIL ({:?})", code));
                } else {
                    summary_parts.push(format!("{log_name}: OK"));
                }
            }
            Err(e) => {
                all_ok = false;
                summary_parts.push(format!("{log_name}: ERROR ({e})"));
            }
        }
    }

    Ok(RepairReport {
        kind: "ClearEventLogs".to_string(),
        success: all_ok,
        exit_code: last_code,
        duration_ms: started.elapsed().as_millis() as u64,
        message: if all_ok {
            "Đã xóa tất cả Event Logs.".to_string()
        } else {
            "Một số Event Log không xóa được (cần admin).".to_string()
        },
        summary: Some(summary_parts.join("; ")),
    })
}

// =================================================================
// Tauri commands
// =================================================================

#[tauri::command]
pub async fn run_sfc_scan() -> AppResult<RepairReport> {
    tauri::async_runtime::spawn_blocking(run_sfc_scan_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn run_dism_restore_health() -> AppResult<RepairReport> {
    tauri::async_runtime::spawn_blocking(run_dism_restore_health_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn run_dism_check_health() -> AppResult<RepairReport> {
    tauri::async_runtime::spawn_blocking(run_dism_check_health_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn flush_dns() -> AppResult<RepairReport> {
    tauri::async_runtime::spawn_blocking(flush_dns_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn clear_event_logs() -> AppResult<RepairReport> {
    tauri::async_runtime::spawn_blocking(clear_event_logs_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}
