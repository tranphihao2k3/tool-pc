//! Auto-update commands (Task 11 - Build & Auto-update).
//!
//! Dùng `tauri-plugin-updater` để:
//! 1. `check_for_update` — kiểm tra bản mới từ endpoint trong tauri.conf.json
//! 2. `download_and_install_update` — tải về + cài đặt, phát event tiến trình
//! 3. `get_current_version` — đọc version hiện tại từ tauri.conf.json
//!
//! Auto-update flow chuẩn:
//! - Frontend gọi `check_for_update` định kỳ / khi user mở Settings
//! - Nếu `available = true` → hiển thị dialog với changelog
//! - User đồng ý → gọi `download_and_install_update`
//! - Progress emit qua event `update-progress` để UI update progress bar
//! - Sau khi cài xong, app tự restart (Windows: passive install)

use crate::domain::{UpdateInfo, UpdateProgressReport};
use crate::AppResult;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_updater::UpdaterExt;

/// Đọc version hiện tại của app (compile-time từ tauri.conf.json).
#[tauri::command]
pub fn get_current_version(app: AppHandle) -> AppResult<String> {
    // Ưu tiên lấy từ tauri.conf.json để đồng bộ với bundle version
    // `app.config().version` là `Option<String>` trong tauri 2.x
    if let Some(v) = app.config().version.as_ref() {
        return Ok(v.clone());
    }
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

/// Kiểm tra xem có bản cập nhật mới không.
#[tauri::command]
pub async fn check_for_update<R: Runtime>(app: AppHandle<R>) -> AppResult<UpdateInfo> {
    let current = get_current_version_for_runtime(&app).unwrap_or_else(|_| "0.0.0".into());

    let updater = app
        .updater()
        .map_err(|e| crate::AppError::Other(format!("Updater init failed: {e}")))?;

    match updater.check().await {
        Ok(Some(update)) => {
            // tauri-plugin-updater v2.14 fields:
            //   - body: Option<String>     (release notes)
            //   - version: String
            //   - date: Option<OffsetDateTime>
            //   - download_url: Url (NOT Option)
            //   - signature: String
            //   - raw_json: serde_json::Value
            let download_url = update.download_url.to_string();
            let notes = update.body.clone();
            let pub_date = update.date.map(|d| d.to_string());
            let latest_version = update.version.clone();

            // Nếu pubkey config đúng thì updater tự verify signature trước khi install
            let signature_valid = !update.signature.is_empty();

            log::info!(
                "Update available: current={}, latest={}, pub_date={:?}",
                current,
                latest_version,
                pub_date
            );

            Ok(UpdateInfo {
                available: true,
                current_version: current.clone(),
                latest_version,
                notes,
                pub_date,
                download_url: Some(download_url),
                signature_valid,
            })
        }
        Ok(None) => Ok(UpdateInfo {
            available: false,
            current_version: current.clone(),
            latest_version: current.clone(),
            notes: None,
            pub_date: None,
            download_url: None,
            signature_valid: true,
        }),
        Err(e) => {
            log::warn!("Update check failed: {e}");
            // Trả về "no update" thay vì lỗi để UI vẫn render được
            Ok(UpdateInfo {
                available: false,
                current_version: current.clone(),
                latest_version: current,
                notes: None,
                pub_date: None,
                download_url: None,
                signature_valid: false,
            })
        }
    }
}

/// Helper: get_current_version dùng được với generic Runtime R.
fn get_current_version_for_runtime<R: Runtime>(app: &AppHandle<R>) -> AppResult<String> {
    if let Some(v) = app.config().version.as_ref() {
        return Ok(v.clone());
    }
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

/// Tải về và cài đặt bản cập nhật. Phát event `update-progress` trong quá trình.
#[tauri::command]
pub async fn download_and_install_update<R: Runtime>(app: AppHandle<R>) -> AppResult<bool> {
    let updater = app
        .updater()
        .map_err(|e| crate::AppError::Other(format!("Updater init failed: {e}")))?;

    // Check xem có bản mới không trước
    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => {
            let _ = app.emit(
                "update-progress",
                UpdateProgressReport {
                    stage: "finished".into(),
                    percent: 100.0,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    message: "Đã là bản mới nhất.".into(),
                },
            );
            return Ok(false);
        }
        Err(e) => {
            return Err(crate::AppError::Other(format!("Check update failed: {e}")));
        }
    };

    let _ = app.emit(
        "update-progress",
        UpdateProgressReport {
            stage: "downloading".into(),
            percent: 0.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            message: format!("Đang tải bản cập nhật {}…", update.version),
        },
    );

    // download_and_install sẽ:
    // 1. Tải file installer (.msi/.nsis)
    // 2. Verify signature
    // 3. Launch installer ở chế độ passive (Windows: chạy nền, tự restart app)
    //
    // Callback `on_chunk` được gọi liên tục để update progress bar.
    // Signature: FnMut(usize, Option<u64>) cho (chunk_length, content_length).
    let app_handle = app.clone();
    let app_install = app.clone();
    let result = update
        .download_and_install(
            move |chunk_length: usize, content_length: Option<u64>| {
                // Chunk callback - chỉ tính lũy tiến bytes
                if let Some(total) = content_length {
                    if total > 0 {
                        let percent = (chunk_length as f64 / total as f64 * 100.0) as f32;
                        let _ = app_handle.emit(
                            "update-progress",
                            UpdateProgressReport {
                                stage: "downloading".into(),
                                percent,
                                downloaded_bytes: chunk_length as u64,
                                total_bytes: total,
                                message: format!("Đang tải… {:.1}%", percent),
                            },
                        );
                        return;
                    }
                }
                let _ = app_handle.emit(
                    "update-progress",
                    UpdateProgressReport {
                        stage: "downloading".into(),
                        percent: 0.0,
                        downloaded_bytes: chunk_length as u64,
                        total_bytes: 0,
                        message: format!("Đã tải {} bytes…", chunk_length),
                    },
                );
            },
            move || {
                let _ = app_install.emit(
                    "update-progress",
                    UpdateProgressReport {
                        stage: "installing".into(),
                        percent: 100.0,
                        downloaded_bytes: 0,
                        total_bytes: 0,
                        message: "Đang cài đặt bản cập nhật…".into(),
                    },
                );
            },
        )
        .await;

    match result {
        Ok(()) => {
            let _ = app.emit(
                "update-progress",
                UpdateProgressReport {
                    stage: "finished".into(),
                    percent: 100.0,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    message: "Cập nhật xong. App sẽ tự khởi động lại.".into(),
                },
            );
            log::info!("Update installed successfully");
            Ok(true)
        }
        Err(e) => {
            let _ = app.emit(
                "update-progress",
                UpdateProgressReport {
                    stage: "failed".into(),
                    percent: 0.0,
                    downloaded_bytes: 0,
                    total_bytes: 0,
                    message: format!("Cập nhật thất bại: {e}"),
                },
            );
            log::error!("Update install failed: {e}");
            Err(crate::AppError::Other(format!("Update install failed: {e}")))
        }
    }
}
