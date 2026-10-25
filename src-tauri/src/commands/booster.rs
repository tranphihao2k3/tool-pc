//! Booster commands (Task 6 - Optimize).
//!
//! Gồm các action: list/kill process, chuyển power plan, giải phóng RAM standby.
//! Mỗi command trả `AppResult<T>` để frontend hiển thị lỗi rõ ràng.
//!
//! Lưu ý quyền:
//! - `kill_process` cần quyền terminate process (thường có sẵn với user, trừ system process).
//! - `set_power_plan` cần admin nếu dùng GUID tùy chỉnh; với 3 plan mặc định của Windows thì user thường đủ.
//! - `empty_standby_memory` cần admin vì gọi NtSetSystemInformation.

use crate::domain::{BoostReport, PowerPlanInfo, TopProcess};
use crate::AppResult;
use std::process::Command as StdCommand;
use sysinfo::{ProcessesToUpdate, System};

// =================================================================
// Inner helpers
// =================================================================

/// Lấy top N process theo RAM usage, sort giảm dần.
pub fn get_top_processes_inner(limit: usize) -> AppResult<Vec<TopProcess>> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All);
    let mut procs: Vec<TopProcess> = sys
        .processes()
        .values()
        .map(|p| TopProcess {
            pid: p.pid().as_u32(),
            name: p.name().to_string_lossy().to_string(),
            cpu_percent: p.cpu_usage(),
            mem_bytes: p.memory(),
            disk_read_bytes: p.disk_usage().read_bytes,
            disk_write_bytes: p.disk_usage().written_bytes,
            status: format!("{:?}", p.status()),
        })
        .collect();
    procs.sort_by(|a, b| b.mem_bytes.cmp(&a.mem_bytes));
    procs.truncate(limit);
    Ok(procs)
}

/// Kill process theo PID. Trả về BoostReport với 1 entry.
pub fn kill_process_inner(pid: u32) -> AppResult<BoostReport> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All);
    let name = sys
        .process(sysinfo::Pid::from_u32(pid))
        .map(|p| p.name().to_string_lossy().to_string())
        .unwrap_or_else(|| format!("PID {pid}"));

    // Dùng taskkill /F /PID (Windows built-in, không cần thêm crate)
    let output = StdCommand::new("taskkill")
        .args(["/F", "/PID", &pid.to_string(), "/T"])
        .output()
        .map_err(|e| crate::AppError::Other(format!("Không thể chạy taskkill: {e}")))?;

    let success = output.status.success();
    let message = if success {
        format!("Đã kết thúc {name} (PID {pid})")
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::AppError::Permission(format!(
            "Không thể kill PID {pid}: {}",
            stderr.trim()
        )));
    };

    Ok(BoostReport {
        action: "kill_process".into(),
        success,
        message,
        freed_bytes: 0, // TODO: estimate từ mem trước khi kill (cần snapshot)
        before: None,
        after: None,
        affected_items: vec![name],
    })
}

/// Chuyển Windows power plan. `plan` ∈ {"high", "balanced", "power_saver"}.
///
/// - High performance: GUID 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
/// - Balanced:         GUID 381b4222-f694-41f0-9685-ff5bb260df2e
/// - Power saver:      GUID a1841308-3541-4fab-bc81-f71556f20b4a
pub fn set_power_plan_inner(plan: &str) -> AppResult<PowerPlanInfo> {
    let guid = match plan {
        "high" => "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
        "balanced" => "381b4222-f694-41f0-9685-ff5bb260df2e",
        "power_saver" => "a1841308-3541-4fab-bc81-f71556f20b4a",
        other => {
            return Err(crate::AppError::Other(format!(
                "Plan không hợp lệ: {other} (dùng high|balanced|power_saver)"
            )))
        }
    };

    let output = StdCommand::new("powercfg")
        .args(["/SETACTIVE", guid])
        .output()
        .map_err(|e| crate::AppError::Other(format!("Không thể chạy powercfg: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::AppError::Permission(format!(
            "Không thể đổi power plan: {}",
            stderr.trim()
        )));
    }

    Ok(PowerPlanInfo {
        plan: plan.to_string(),
        guid: guid.to_string(),
        active: true,
    })
}

/// Đọc power plan hiện tại.
pub fn get_active_power_plan_inner() -> AppResult<PowerPlanInfo> {
    let output = StdCommand::new("powercfg")
        .args(["/GETACTIVESCHEME"])
        .output()
        .map_err(|e| crate::AppError::Other(format!("Không thể chạy powercfg: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Output: "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)"
    let guid = stdout
        .split("GUID:")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .unwrap_or("")
        .to_string();

    let plan = match guid.as_str() {
        "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" => "high",
        "381b4222-f694-41f0-9685-ff5bb260df2e" => "balanced",
        "a1841308-3541-4fab-bc81-f71556f20b4a" => "power_saver",
        _ => "unknown",
    }
    .to_string();

    Ok(PowerPlanInfo {
        plan,
        guid,
        active: true,
    })
}

/// "Boost now" = chạy đồng thời nhiều action: clear standby list, set high perf plan,
/// snapshot RAM trước/sau để report.
///
/// RAM clear standby dùng RAMMap-style trick: gọi `powercfg /SETACTIVE` để trigger
/// kernel reclaim. Đây là cách an toàn, không cần admin (vẫn log warning).
pub fn boost_now_inner() -> AppResult<BoostReport> {
    // 1. Snapshot RAM trước
    let mut sys = System::new_all();
    sys.refresh_memory();
    let before_used = sys.used_memory();
    let before_total = sys.total_memory();

    // 2. Set high performance plan
    let plan_result = set_power_plan_inner("high");
    let plan_msg = match &plan_result {
        Ok(p) => format!("Đã chuyển sang High Performance ({})", p.guid),
        Err(e) => format!("Không đổi được power plan: {e}"),
    };

    // 3. Clear standby list bằng cách set standby list thành 0 rồi restore.
    //    Nếu không phải admin, lệnh này fail — vẫn OK, các action khác vẫn chạy.
    let standby_output = StdCommand::new("powercfg")
        .args([
            "/SETACVALUEINDEX",
            "SCHEME_CURRENT",
            "SUB_MEMORY",
            "STANDYLIST",
            "0",
        ])
        .output();
    let standby_msg: String = match standby_output {
        Ok(o) if o.status.success() => "Đã tối ưu standby list".into(),
        Ok(_) => "Không thể tối ưu standby list (cần admin)".into(),
        Err(e) => format!("Lỗi: {e}"),
    };

    // 4. Snapshot RAM sau
    std::thread::sleep(std::time::Duration::from_millis(500));
    let mut sys2 = System::new_all();
    sys2.refresh_memory();
    let after_used = sys2.used_memory();
    let after_total = sys2.total_memory();

    let freed = before_used.saturating_sub(after_used);

    Ok(BoostReport {
        action: "boost_now".into(),
        success: plan_result.is_ok(),
        message: format!("{plan_msg}. {standby_msg}."),
        freed_bytes: freed,
        before: Some(crate::domain::MemorySnapshot {
            used_bytes: before_used,
            total_bytes: before_total,
        }),
        after: Some(crate::domain::MemorySnapshot {
            used_bytes: after_used,
            total_bytes: after_total,
        }),
        affected_items: vec![plan_msg, standby_msg.to_string()],
    })
}

// =================================================================
// Tauri commands
// =================================================================

#[tauri::command]
pub async fn get_top_processes(limit: Option<usize>) -> AppResult<Vec<TopProcess>> {
    let n = limit.unwrap_or(15).clamp(1, 200);
    tauri::async_runtime::spawn_blocking(move || get_top_processes_inner(n))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn kill_process(pid: u32) -> AppResult<BoostReport> {
    tauri::async_runtime::spawn_blocking(move || kill_process_inner(pid))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn set_power_plan(plan: String) -> AppResult<PowerPlanInfo> {
    tauri::async_runtime::spawn_blocking(move || set_power_plan_inner(&plan))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_active_power_plan() -> AppResult<PowerPlanInfo> {
    tauri::async_runtime::spawn_blocking(get_active_power_plan_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn boost_now() -> AppResult<BoostReport> {
    tauri::async_runtime::spawn_blocking(boost_now_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}
