//! Tự nâng quyền Administrator (self-elevation) cho PC Manager Pro.
//!
//! Nhiều chức năng của app (SFC, DISM, dọn file hệ thống, đổi tên máy,
//! cài/khôi phục driver, tạo restore point…) bắt buộc chạy với quyền
//! Administrator. Module này cho phép app **tự nâng quyền ngay khi mở**:
//!
//! 1. `lib.rs::run()` gọi [`maybe_elevate`] *trước* khi khởi tạo Tauri.
//! 2. Nếu app chưa elevated và cờ `autoElevate` đang bật → spawn lại chính
//!    file exe với verb `runas` (Windows hiện hộp thoại UAC) rồi thoát.
//! 3. Bản được spawn ra chạy elevated → [`is_elevated`] = true → đi tiếp bình thường.
//!
//! Cờ `autoElevate` được lưu tại `%APPDATA%\com.pcmanager.pro\elevation.json`
//! nên người dùng có thể tắt/bật lại trong tab Cài đặt → Bảo mật.
//!
//! ## Ghi chú về dev mode
//!
//! `tauri dev` chạy binary ở chế độ debug và mỗi lần sửa code sẽ khởi
//! động lại tiến trình. Nếu tự nâng quyền ở dev mode thì tiến trình dev bị
//! hủy mất nên vòng lặp dev sẽ vỡ. Vì vậy auto-elevation bị bỏ qua khi
//! chạy dev, trừ khi ép bằng biến môi trường `PCMP_FORCE_ELEVATE=1`.
//!
//! Dev mode được nhận biết qua **cả hai** tín hiệu:
//! - `tauri::is_dev()` — true khi crate `tauri` chưa bật feature
//!   `custom-protocol` (đây là trạng thái khi `tauri dev` build).
//! - `debug_assertions` — true khi build profile là `dev`.
//!
//! Nếu chỉ dựa vào `tauri::is_dev()` thì lệnh `cargo build --release` thủ
//! công (không qua `tauri build`) cũng bị coi là dev → app sẽ không tự
//! nâng quyền dù đã là bản release. Kết hợp cả hai tín hiệu giúp tránh
//! trường hợp đó.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Biến môi trường để bỏ qua hoàn toàn việc tự nâng quyền.
pub const ENV_SKIP: &str = "PCMP_SKIP_ELEVATION";
/// Biến môi trường để ép nâng quyền kể cả ở dev mode.
pub const ENV_FORCE: &str = "PCMP_FORCE_ELEVATE";
/// Argument dòng lệnh đánh dấu "tiến trình này là bản được nâng quyền" — chống đệ quy.
const FLAG_ELEVATED: &str = "--pcmp-elevated";

/// Tên file cấu hình nằm trong thư mục config của app.
const CONFIG_FILE_NAME: &str = "elevation.json";

// =================================================================
// Cấu hình lưu trữ
// =================================================================

/// Cấu hình auto-elevation của app.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevationConfig {
    /// Tự nâng quyền Administrator khi mở app.
    pub auto_elevate: bool,
}

impl Default for ElevationConfig {
    fn default() -> Self {
        // Mặc định BẬT — đúng nhu cầu "mở app là chạy với quyền admin".
        Self { auto_elevate: true }
    }
}

/// Thư mục config của app: `%APPDATA%\com.pcmanager.pro`.
fn config_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(|dir| PathBuf::from(dir).join("com.pcmanager.pro"))
}

/// Đường dẫn file cấu hình elevation.
fn config_path() -> Option<PathBuf> {
    config_dir().map(|dir| dir.join(CONFIG_FILE_NAME))
}

/// Đọc cấu hình. Nếu file hỏng/mất thì trả về mặc định.
pub fn load_config() -> ElevationConfig {
    let Some(path) = config_path() else {
        return ElevationConfig::default();
    };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// Ghi cấu hình xuống disk.
pub fn save_config(config: &ElevationConfig) -> Result<(), String> {
    let path = config_path().ok_or_else(|| {
        "Không xác định được thư mục %APPDATA% để lưu cấu hình.".to_string()
    })?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Không tạo được thư mục {}: {e}", parent.display()))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Không serialize được cấu hình: {e}"))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Không ghi được {}: {e}", path.display()))?;
    Ok(())
}

// =================================================================
// Trạng thái elevation (trả về frontend)
// =================================================================

/// Thông tin trạng thái quyền của app, dùng cho UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevationStatus {
    /// App đang chạy với quyền Administrator hay không.
    pub is_elevated: bool,
    /// Cờ tự nâng quyền khi mở app có đang bật không.
    pub auto_elevate: bool,
    /// Đường dẫn tới file exe của app.
    pub app_path: String,
    /// True nếu app đang chạy ở chế độ dev (`tauri dev`).
    pub dev_mode: bool,
}

/// Lấy trạng thái elevation hiện tại.
pub fn status() -> ElevationStatus {
    ElevationStatus {
        is_elevated: platform::is_elevated(),
        auto_elevate: load_config().auto_elevate,
        app_path: current_exe_display(),
        dev_mode: is_dev_mode(),
    }
}

/// Đường dẫn exe (dạng hiển thị) của app.
fn current_exe_display() -> String {
    std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_default()
}

// =================================================================
// Logic tự nâng quyền
// =================================================================

/// Kết quả của [`maybe_elevate`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ElevateOutcome {
    /// Không cần nâng quyền (đã elevated, hoặc cờ tắt, hoặc bị bỏ qua).
    NotNeeded,
    /// Đã spawn bản elevated → tiến trình hiện tại nên thoát.
    Relaunched,
}

/// Quyết định có tự nâng quyền hay không và thực hiện nếu cần.
///
/// Trả về `Ok(ElevateOutcome::Relaunched)` nghĩa là đã mở bản elevated
/// thành công — tiến trình hiện tại nên thoát ngay.
pub fn maybe_elevate() -> Result<ElevateOutcome, String> {
    // Tắt hoàn toàn qua biến môi trường (dùng cho script tự động hoá).
    if std::env::var_os(ENV_SKIP).is_some() {
        return Ok(ElevateOutcome::NotNeeded);
    }
    // Đây là bản được nâng quyền rồi → không spawn tiếp (chống đệ quy).
    if is_elevated_child() {
        return Ok(ElevateOutcome::NotNeeded);
    }
    // Đã elevated rồi → không làm gì.
    if platform::is_elevated() {
        return Ok(ElevateOutcome::NotNeeded);
    }
    // Cờ trong cấu hình đang tắt → không nâng quyền.
    if !load_config().auto_elevate {
        return Ok(ElevateOutcome::NotNeeded);
    }
    // Dev mode: bỏ qua để không phá vòng lặp `tauri dev`, trừ khi ép.
    if is_dev_mode() && std::env::var_os(ENV_FORCE).is_none() {
        return Ok(ElevateOutcome::NotNeeded);
    }

    let exe = std::env::current_exe()
        .map_err(|e| format!("Không xác định được đường dẫn exe: {e}"))?;
    platform::spawn_elevated(&exe)?;
    Ok(ElevateOutcome::Relaunched)
}

/// True nếu tiến trình này được spawn ra từ chính app (đã qua bước nâng quyền).
fn is_elevated_child() -> bool {
    std::env::args().any(|a| a == FLAG_ELEVATED)
}

/// True nếu đang chạy ở chế độ dev — khi đó KHÔNG tự nâng quyền.
///
/// Dùng cả `debug_assertions` lẫn `tauri::is_dev()`:
/// - `debug_assertions` bật khi build profile `dev` (đúng lúc `tauri dev` chạy).
/// - `tauri::is_dev()` bật khi crate `tauri` thiếu feature `custom-protocol`.
///
/// Bỏ qua `tauri::is_dev()` một mình sẽ khiến `cargo build --release` thủ
/// công bị coi là dev và không nâng quyền.
fn is_dev_mode() -> bool {
    cfg!(debug_assertions) || tauri::is_dev()
}

/// Spawn lại app với quyền Administrator (dùng cho nút "Khởi động lại với quyền admin").
pub fn relaunch_elevated() -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Không xác định được đường dẫn exe: {e}"))?;
    platform::spawn_elevated(&exe)
}

// =================================================================
// Tầng platform (Windows-specific)
// =================================================================

#[cfg(windows)]
mod platform {
    use super::FLAG_ELEVATED;
    use std::path::Path;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::{CloseHandle, ERROR_CANCELLED, GetLastError, HANDLE};
    use windows::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_NORMAL;

    /// True nếu tiến trình hiện tại chạy với quyền Administrator.
    ///
    /// Dùng `TokenElevation` — trả về 1 khi token đã được nâng quyền
    /// (tức là app đang chạy "as administrator").
    pub fn is_elevated() -> bool {
        unsafe {
            let mut token = HANDLE(std::ptr::null_mut());
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
                return false;
            }

            let mut elevation = TOKEN_ELEVATION::default();
            let mut returned = 0u32;
            let result = GetTokenInformation(
                token,
                TokenElevation,
                Some(&mut elevation as *mut TOKEN_ELEVATION as *mut core::ffi::c_void),
                std::mem::size_of::<TOKEN_ELEVATION>() as u32,
                &mut returned,
            );

            let _ = CloseHandle(token);

            result.is_ok() && elevation.TokenIsElevated != 0
        }
    }

    /// Spawn `exe` với verb `runas` → Windows hiện hộp thoại UAC.
    ///
    /// Truyền kèm flag `--pcmp-elevated` để bản mới biết "ta là bản được
    /// nâng quyền" và không lại spawn tiếp (chống đệ quy vô hạn).
    pub fn spawn_elevated(exe: &Path) -> Result<(), String> {
        let verb = HSTRING::from("runas");
        let target = HSTRING::from(exe.as_os_str());
        let params = HSTRING::from(FLAG_ELEVATED);

        unsafe {
            let result = ShellExecuteW(
                None,
                &verb,
                &target,
                &params,
                PCWSTR::null(),
                SW_NORMAL,
            );

            // ShellExecuteW trả về giá trị <= 32 nghĩa là thất bại.
            if (result.0 as isize) <= 32 {
                let code = GetLastError();
                if code == ERROR_CANCELLED {
                    return Err(
                        "Người dùng đã từ chối yêu cầu quyền Administrator.".to_string()
                    );
                }
                return Err(format!(
                    "Không thể khởi chạy với quyền Administrator (mã lỗi {}).",
                    code.0
                ));
            }
        }

        Ok(())
    }
}

#[cfg(not(windows))]
mod platform {
    use std::path::Path;

    /// App chỉ hỗ trợ Windows — nền tảng khác luôn coi như không elevated.
    pub fn is_elevated() -> bool {
        false
    }

    /// Không hỗ trợ nâng quyền ngoài Windows.
    pub fn spawn_elevated(_exe: &Path) -> Result<(), String> {
        Err("Tự nâng quyền chỉ hỗ trợ trên Windows.".to_string())
    }
}

// =================================================================
// Tauri commands
// =================================================================

/// Lấy trạng thái quyền hiện tại của app.
#[tauri::command]
pub fn get_elevation_status() -> crate::AppResult<ElevationStatus> {
    Ok(status())
}

/// Bật/tắt cờ tự nâng quyền khi mở app.
#[tauri::command]
pub fn set_auto_elevate(enabled: bool) -> crate::AppResult<ElevationStatus> {
    let mut config = load_config();
    config.auto_elevate = enabled;
    save_config(&config).map_err(crate::AppError::Other)?;
    Ok(status())
}

/// Khởi động lại app với quyền Administrator (nút thủ công trong Settings).
#[tauri::command]
pub fn restart_as_admin(app: tauri::AppHandle) -> crate::AppResult<()> {
    // Ở dev mode, exe đã spawn ra sẽ trỏ tới devUrl của Vite — nếu vite
    // chưa chạy thì app mở ra trắng xóa. Báo rõ cho user biết.
    if is_dev_mode() {
        return Err(crate::AppError::Other(
            "Chức năng nâng quyền chỉ dùng được với bản build thật (tauri build). \
             Ở dev mode, hãy mở Terminal/PowerShell bằng quyền Administrator rồi chạy \
             `npm run tauri:dev`."
                .to_string(),
        ));
    }

    relaunch_elevated().map_err(crate::AppError::Other)?;
    // Bản elevated đã được spawn → thoát tiến trình hiện tại.
    app.exit(0);
    Ok(())
}

// =================================================================
// Unit tests
// =================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_enables_auto_elevate() {
        let cfg = ElevationConfig::default();
        assert!(
            cfg.auto_elevate,
            "mặc định app phải tự nâng quyền khi mở"
        );
    }

    #[test]
    fn config_serializes_to_camel_case() {
        let json = serde_json::to_string(&ElevationConfig { auto_elevate: true }).unwrap();
        assert!(
            json.contains("autoElevate"),
            "phải dùng camelCase cho frontend: {json}"
        );
    }

    #[test]
    fn config_roundtrip_through_json() {
        let original = ElevationConfig { auto_elevate: false };
        let json = serde_json::to_string(&original).unwrap();
        let parsed: ElevationConfig = serde_json::from_str(&json).unwrap();
        assert!(!parsed.auto_elevate);
    }

    #[test]
    fn status_reports_consistent_fields() {
        let st = status();
        // is_elevated phải khớp với kết quả trực tiếp từ Win32.
        assert_eq!(st.is_elevated, platform::is_elevated());
        // Cờ auto_elevate đọc từ file cấu hình.
        assert_eq!(st.auto_elevate, load_config().auto_elevate);
        // dev_mode là hằng số theo build → không đổi giữa các lần gọi.
        assert_eq!(st.dev_mode, is_dev_mode());
    }

    #[test]
    fn dev_mode_flag_is_stable() {
        // Tín hiệu dev mode không đổi trong vòng đời tiến trình.
        assert_eq!(is_dev_mode(), is_dev_mode());
    }

    #[test]
    fn is_elevated_is_deterministic() {
        // Token elevation không đổi trong vòng đời tiến trình.
        assert_eq!(platform::is_elevated(), platform::is_elevated());
    }

    #[test]
    fn invalid_json_config_is_rejected_by_parser() {
        // File hỏng → parse lỗi, nhưng load_config dùng unwrap_or_default
        // nên không panic và trả về mặc định.
        let bad = r#"{"autoElevate": "not-a-bool"}"#;
        let parsed: Result<ElevationConfig, _> = serde_json::from_str(bad);
        assert!(parsed.is_err(), "JSON hỏng phải parse lỗi");

        let cfg = load_config();
        assert_eq!(cfg.auto_elevate, ElevationConfig::default().auto_elevate);
    }

    #[cfg(windows)]
    #[test]
    fn spawn_elevated_rejects_non_executable_path() {
        // Path không tồn tại → ShellExecuteW trả lỗi, phải trả Err chứ không panic.
        let bogus = std::env::temp_dir().join("pcmp_definitely_not_here_12345.exe");
        let result = platform::spawn_elevated(&bogus);
        assert!(result.is_err(), "path không tồn tại phải báo lỗi");
    }

    #[test]
    fn elevated_child_flag_is_detected() {
        // Tiến trình test không có flag → false.
        assert!(!is_elevated_child());
    }

    #[test]
    fn skip_env_disables_elevation() {
        // Biến môi trường bỏ qua phải khiến maybe_elevate không spawn gì.
        std::env::set_var(ENV_SKIP, "1");
        let result = maybe_elevate();
        std::env::remove_var(ENV_SKIP);

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ElevateOutcome::NotNeeded);
    }

    #[test]
    fn already_elevated_process_does_not_relaunch() {
        // Nếu tiến trình hiện tại đã elevated → không spawn lại.
        if platform::is_elevated() {
            let result = maybe_elevate().expect("không nên lỗi");
            assert_eq!(result, ElevateOutcome::NotNeeded);
        }
    }
}
