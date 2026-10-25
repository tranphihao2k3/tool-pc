//! PC Manager Pro - Tauri runtime + commands.
//!
//! File này mount các plugin Tauri và đăng ký tất cả `#[tauri::command]`
//! từ module `commands::*` và `monitor::*`. App chỉ hỗ trợ Windows (cần WMI/Registry).

use serde::{Deserialize, Serialize};

/// Lỗi chuẩn hóa trả về frontend, dễ debug & hiển thị.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum AppError {
    #[error("WMI error: {0}")]
    Wmi(String),
    #[error("Registry error: {0}")]
    Registry(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("Not implemented: {0}")]
    NotImplemented(String),
    #[error("Permission denied: {0}")]
    Permission(String),
    #[error("{0}")]
    Other(String),
}

pub type AppResult<T> = Result<T, AppError>;

mod commands;
mod domain;
mod driver_library;
mod elevation;
mod gpu;
mod machine_profile;
mod monitor;
mod stats;

#[cfg(test)]
mod integration_tests;

use commands::{
    booster, cleaner, driver, repair, security, system_info, tools, updater, windows_config,
};

/// Payload log từ frontend → Rust.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrontendLogPayload {
    level: String,
    scope: String,
    message: String,
    meta: Option<serde_json::Value>,
}

/// Lệnh log phía frontend. Ghi ra plugin-log (đã được mount trong run()),
/// file sẽ nằm ở %APPDATA%\com.pcmanager.pro\logs\.
#[tauri::command]
fn frontend_log(payload: FrontendLogPayload) {
    // Format gọn: [scope] message | meta
    let meta_str = match &payload.meta {
        Some(v) => format!(" | {}", v),
        None => String::new(),
    };
    let line = format!("[{}] {}{}", payload.scope, payload.message, meta_str);
    match payload.level.as_str() {
        "error" => log::error!("[FE] {line}"),
        "warn" => log::warn!("[FE] {line}"),
        _ => log::info!("[FE] {line}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ── Tự nâng quyền Administrator ────────────────────────────────────
    // Nếu app chưa chạy với quyền admin, spawn lại chính nó với verb "runas"
    // (Windows hiện hộp thoại UAC) rồi thoát tiến trình hiện tại.
    // Bản được spawn ra sẽ chạy elevated và đi tiếp bình thường.
    //
    // Lưu ý: plugin-log chưa được init ở đây nên chỉ dùng `eprintln!` —
    // stdout/stderr vẫn hiện được trong console khi chạy dev.
    match elevation::maybe_elevate() {
        Ok(elevation::ElevateOutcome::Relaunched) => {
            eprintln!("[Elevation] Đã khởi chạy lại với quyền Administrator.");
            std::process::exit(0);
        }
        Ok(elevation::ElevateOutcome::NotNeeded) => {}
        Err(e) => {
            // Không nâng được quyền → vẫn chạy app, các tính năng cần admin
            // sẽ báo lỗi riêng. Chỉ ghi log để không chặn user.
            eprintln!("[Elevation] Không thể tự nâng quyền: {e}");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Spawn background realtime monitor (Task 5)
            monitor::spawn_realtime_monitor(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // System Info (Task 3)
            system_info::ping,
            system_info::get_os_info,
            system_info::get_cpu_info,
            system_info::get_ram_info,
            system_info::get_mainboard_info,
            system_info::get_disk_info,
            system_info::get_gpu_info,
            system_info::get_network_info,
            system_info::get_installed_software,
            system_info::get_startup_programs,
            system_info::get_drivers,
            // Realtime monitor (Task 5)
            monitor::get_realtime_stats,
            // Booster (Task 6 - Optimize)
            booster::get_top_processes,
            booster::kill_process,
            booster::set_power_plan,
            booster::get_active_power_plan,
            booster::boost_now,
            // Cleaner (Task 6 - UX-14)
            cleaner::scan_clean_targets,
            cleaner::delete_clean_targets,
            cleaner::empty_recycle_bin,
            // Repair (Task 6 - UX-16)
            repair::run_sfc_scan,
            repair::run_dism_restore_health,
            repair::run_dism_check_health,
            repair::flush_dns,
            repair::clear_event_logs,
            // Security / Windows Defender (Task 7 - UX-20..24)
            security::get_defender_status,
            security::start_defender_scan,
            security::get_threats,
            security::act_on_threat,
            security::get_defender_preferences,
            security::set_defender_preference,
            security::update_defender_signatures,
            security::get_defender_exclusions,
            security::add_defender_exclusion,
            security::remove_defender_exclusion,
            security::get_firewall_profiles,
            security::set_firewall_profile,
            // Driver Manager (Task 8 - UX-25..27)
            driver::list_drivers,
            driver::get_driver_summary,
            driver::search_drivers,
            driver::backup_drivers,
            driver::open_backup_folder,
            // Thư viện driver theo HÃNG / DÒNG (Task 15)
            driver::get_machine_profile,
            driver::preview_driver_library,
            driver::backup_driver_library,
            driver::scan_driver_library,
            driver::restore_driver_library_group,
            // Tools Hub (Task 9 - UX-28)
            tools::list_installed_apps,
            tools::uninstall_app,
            tools::run_disk_cleanup,
            tools::run_defrag,
            tools::shred_file,
            tools::scan_registry,
            tools::find_duplicates,
            tools::find_large_files,
            tools::create_restore_point,
            tools::list_power_plans,
            tools::set_power_plan_tools,
            tools::reset_network,
            tools::generate_battery_report,
            tools::list_tool_processes,
            tools::kill_tool_process,
            tools::check_disk,
            // Auto-update (Task 11)
            updater::get_current_version,
            updater::check_for_update,
            updater::download_and_install_update,
            // Thiết lập (Task 14) — Định danh / Cá nhân hóa / Pin & Nguồn / Kích hoạt
            windows_config::get_identity_settings,
            windows_config::apply_identity_settings,
            windows_config::get_personalization_settings,
            windows_config::apply_personalization_settings,
            windows_config::get_power_settings,
            windows_config::apply_power_settings,
            windows_config::get_activation_status,
            windows_config::refresh_explorer,
            // Polish (Task 12)
            frontend_log,
            // Tự nâng quyền Administrator
            elevation::get_elevation_status,
            elevation::set_auto_elevate,
            elevation::restart_as_admin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
