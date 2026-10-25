//! Thiết lập hệ thống (Task 14) — 4 nhóm chức năng:
//!   1. Định danh    — tên máy, tổ chức, múi giờ, vùng, định dạng ngày/giờ/số, bàn phím
//!   2. Cá nhân hóa  — theme, hình nền, biểu tượng Desktop, màu nhấn, màn hình khóa
//!   3. Pin & Nguồn  — thời gian ngủ, tắt màn hình, gói nguồn, trạng thái pin
//!   4. Kích hoạt    — trạng thái license Windows
//!
//! **Nguồn dữ liệu** (chỉ dùng API có sẵn của Windows cho an toàn):
//! - Registry HKCU/HKLM cho identity + personalization
//! - `tzutil /g` / `tzutil /l` / `tzutil /s <tz>` cho múi giờ
//!   (registry `...\TimeZone\TimeZones` KHÔNG tồn tại trên Windows 11 hiện đại)
//! - `powercfg /query` + `powercfg /setacvalueindex` cho power
//! - WMI `Win32_Battery` cho pin, `SoftwareLicensingProduct` cho license
//!
//! **Quyền**: HKCU không cần admin. HKLM (đổi tên máy, tổ chức) và
//! `powercfg /setacvalueindex` cần admin → trả `AppError::Permission`.
//!
//! **Restart explorer**: đổi theme/hình nền/biểu tượng Desktop cần
//! `taskkill /f /im explorer.exe`. Đổi tên máy / múi giờ cần đăng nhập lại.

use crate::domain::{
    AccentColor, ActivationStatus, ApplyResult, BatteryStatus, CountryOption, DesktopIcons,
    IdentityPatch, IdentitySettings, KeyboardLayout, LocaleSettings,
    PersonalizationPatch, PersonalizationSettings, PowerPatch, PowerPlanOption, PowerSettings,
    SelectOption, TimeZoneOption,
};
use crate::{AppError, AppResult};
use std::collections::HashMap;
use std::io::ErrorKind;
use std::process::Command as StdCommand;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_ALL_ACCESS};
use winreg::RegKey;

// =================================================================
// Helpers
// =================================================================

fn run(program: &str, args: &[&str]) -> Result<(bool, String, String), String> {
    let out = StdCommand::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("Không thể chạy {program}: {e}"))?;
    Ok((
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).to_string(),
        String::from_utf8_lossy(&out.stderr).to_string(),
    ))
}

/// Phân biệt lỗi "cần admin" với lỗi khác để frontend hướng xử lý đúng.
fn map_cmd_err(stderr: &str, ctx: &str) -> AppError {
    let lower = stderr.to_lowercase();
    if lower.contains("access is denied")
        || lower.contains("requires elevation")
        || lower.contains("administrator")
    {
        AppError::Permission(format!("{ctx} cần chạy app với quyền Administrator"))
    } else {
        AppError::Other(format!("{ctx}: {}", stderr.trim()))
    }
}

fn hkcu() -> RegKey {
    RegKey::predef(HKEY_CURRENT_USER)
}

fn hklm() -> RegKey {
    RegKey::predef(HKEY_LOCAL_MACHINE)
}

/// Đọc REG_DWORD. `winreg` chỉ hỗ trợ u32/u64/String nên không có biến thể i32.
fn dword(key: &RegKey, name: &str) -> Option<u32> {
    key.get_value::<u32, _>(name).ok()
}

/// Đọc REG_SZ.
fn string(key: &RegKey, name: &str) -> Option<String> {
    key.get_value::<String, _>(name).ok()
}

/// Mở khóa để ghi, tự tạo nếu chưa có (RegCreateKeyEx tạo cả key trung gian).
fn open_for_write(hive: &RegKey, path: &str) -> Result<RegKey, String> {
    match hive.open_subkey_with_flags(path, KEY_ALL_ACCESS) {
        Ok(k) => Ok(k),
        Err(e) if e.kind() == ErrorKind::NotFound => {
            let (k, _) = hive
                .create_subkey(path)
                .map_err(|ce| format!("Không tạo được khóa {path}: {ce}"))?;
            Ok(k)
        }
        Err(e) => Err(format!("Không mở được khóa {path}: {e}")),
    }
}

fn write_dword(key: &RegKey, name: &str, value: u32) -> Result<(), String> {
    key.set_value(name, &value)
        .map_err(|e| format!("Không ghi được DWORD {name}: {e}"))
}

fn write_string(key: &RegKey, name: &str, value: &str) -> Result<(), String> {
    key.set_value(name, &value)
        .map_err(|e| format!("Không ghi được STRING {name}: {e}"))
}

/// Restart explorer.exe để áp dụng thay đổi giao diện (Windows tự khởi động lại).
fn restart_explorer() {
    let _ = StdCommand::new("taskkill")
        .args(["/f", "/im", "explorer.exe"])
        .output();
}

// =================================================================
// Bảng dữ liệu tĩnh
// =================================================================

/// Bảng màu nhấn chuẩn của Windows 10/11 — lưu dạng "#RRGGBB".
/// ABGR được tính lúc runtime bằng `hex_to_abgr` để không nhầm byte order.
const ACCENT_PALETTE: &[(&str, &str, &str)] = &[
    ("windows.blue", "Xanh dương", "#0078D7"),
    ("windows.teal", "Xanh ngọc", "#038387"),
    ("windows.green", "Xanh lá", "#107C10"),
    ("windows.lime", "Xanh chanh", "#498205"),
    ("windows.yellow", "Vàng", "#C19C00"),
    ("windows.orange", "Cam", "#CA5010"),
    ("windows.red", "Đỏ", "#A4262C"),
    ("windows.crimson", "Đỏ tươi", "#881798"),
    ("windows.pink", "Hồng", "#E3008C"),
    ("windows.purple", "Tím", "#6B69D6"),
    ("windows.indigo", "Chàm", "#4B4B4B"),
    ("windows.graphite", "Graphite", "#69797E"),
];

/// Quốc gia/vùng phổ biến — chỉ locale + tên.
/// Mã bàn phím KHÔNG hardcode vì khác nhau giữa các bản Windows
/// (Tiếng Việt = 0000042a = 1066) — lấy động từ registry.
const COUNTRIES: &[(&str, &str)] = &[
    ("en-VN", "Việt Nam"),
    ("en-US", "Hoa Kỳ"),
    ("en-GB", "Anh"),
    ("fr-FR", "Pháp"),
    ("de-DE", "Đức"),
    ("ja-JP", "Nhật Bản"),
    ("ko-KR", "Hàn Quốc"),
    ("zh-CN", "Trung Quốc"),
    ("zh-TW", "Đài Loan"),
    ("es-ES", "Tây Ban Nha"),
    ("it-IT", "Ý"),
    ("ru-RU", "Nga"),
    ("id-ID", "Indonesia"),
    ("th-TH", "Thái Lan"),
    ("hi-IN", "Ấn Độ"),
    ("ms-MY", "Malaysia"),
    ("tr-TR", "Thổ Nhĩ Kỳ"),
    ("pl-PL", "Ba Lan"),
];

/// Các định dạng ngày hay dùng.
const DATE_FORMATS: &[&str] = &[
    "dd/MM/yyyy",   // Việt Nam
    "MM/dd/yyyy",   // Hoa Kỳ
    "yyyy-MM-dd",   // ISO
    "dd-MM-yyyy",
    "d MMMM yyyy",
    "yyyy/MM/dd",
];

const TIME_FORMATS: &[&str] = &["HH:mm:ss", "h:mm:ss tt", "HH:mm"];

const DECIMAL_FORMATS: &[&str] = &[".", ","];
const THOUSAND_FORMATS: &[&str] = &[",", ".", " "];

/// Power scheme GUID → key chuẩn hoá cho frontend.
fn power_plan_key(guid: &str) -> &'static str {
    match guid.to_ascii_lowercase().as_str() {
        "381b4222-f694-41f0-9685-ff5bb260df2e" => "balanced",
        "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" => "high",
        "a1841308-3541-4fab-bc81-f71556f20b4a" => "power_saver",
        // "Ultimate Performance" chỉ có trên bản Pro/Enterprise.
        "e9a42b02-d5df-448d-aa00-03f14749eb61" => "ultimate",
        _ => "unknown",
    }
}

/// "#RRGGBB" → DWORD ABGR (0xAABBGGRR) — định dạng Windows dùng cho
/// `AccentColorMenu` / `ColorizationColor`.
fn hex_to_abgr(hex: &str) -> Option<u32> {
    let h = hex.trim().trim_start_matches('#');
    if h.len() != 6 {
        return None;
    }
    let rgb = u32::from_str_radix(h, 16).ok()?;
    let r = rgb & 0xFF;
    let g = (rgb >> 8) & 0xFF;
    let b = (rgb >> 16) & 0xFF;
    Some(0xFF00_0000 | (b << 16) | (g << 8) | r)
}

/// DWORD ABGR → "#RRGGBB" để hiển thị.
fn abgr_to_hex(abgr: u32) -> String {
    let r = abgr & 0xFF;
    let g = (abgr >> 8) & 0xFF;
    let b = (abgr >> 16) & 0xFF;
    format!("#{r:02X}{g:02X}{b:02X}")
}

// =================================================================
// 1. ĐỊNH DANH
// =================================================================

/// Đọc danh sách múi giờ từ output của `tzutil /l`.
///
/// Mỗi múi giờ gồm 2 dòng:
///   (UTC+07:00) Bangkok, Hanoi, Jakarta
///   SE Asia Standard Time
///
/// Registry `...\TimeZone\TimeZones` KHÔNG tồn tại trên Windows 11 hiện đại
/// nên phải dùng `tzutil /l` — nguồn chính thức của chính Windows.
fn read_time_zones(current_tz: &str) -> Vec<TimeZoneOption> {
    let Ok((true, stdout, _)) = run("tzutil", &["/l"]) else {
        return Vec::new();
    };

    let mut out: Vec<TimeZoneOption> = Vec::new();
    let mut pending_display: Option<String> = None;

    for raw in stdout.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        // Dòng bắt đầu bằng "(UTC" là phần offset + tên khu vực.
        if line.starts_with("(UTC") {
            pending_display = Some(line.to_string());
            continue;
        }
        // Dòng còn lại là tzutil ID.
        let tz_id = line.to_string();
        let display = pending_display.take().unwrap_or_else(|| tz_id.clone());
        out.push(TimeZoneOption {
            is_current: tz_id.eq_ignore_ascii_case(current_tz),
            tz_id,
            display,
        });
    }

    // Đưa múi giờ hiện tại lên đầu cho UX tốt hơn.
    out.sort_by(|a, b| b.is_current.cmp(&a.is_current).then(a.tz_id.cmp(&b.tz_id)));
    out
}

/// Đọc danh sách bố cục bàn phím đã cài từ
/// `HKLM\SYSTEM\CurrentControlSet\Control\Keyboard Layouts`.
///
/// Mỗi subkey tên là mã hex (vd "00000409" → 1033 = US), bên trong có
/// "Layout Text" (vd "US", "Vietnamese").
fn read_keyboard_layouts(current_id: u32) -> Vec<KeyboardLayout> {
    let Ok(root) = hklm().open_subkey(r"SYSTEM\CurrentControlSet\Control\Keyboard Layouts")
    else {
        return Vec::new();
    };

    let mut out: Vec<KeyboardLayout> = Vec::new();
    for name in root.enum_keys().flatten() {
        // Tên subkey là hex, ví dụ "0000042a" → 1066 (Vietnamese).
        let Some(id) = u32::from_str_radix(&name, 16).ok() else {
            continue;
        };
        let Ok(sub) = root.open_subkey(&name) else {
            continue;
        };
        let layout_text = string(&sub, "Layout Text").unwrap_or_default();
        if layout_text.is_empty() {
            continue;
        }
        out.push(KeyboardLayout {
            is_current: id == current_id,
            id,
            name: layout_text,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Đọc nhóm Định danh từ registry.
fn read_identity() -> AppResult<IdentitySettings> {
    let mut computer_name = String::new();
    let mut organization = String::new();
    let mut registered_owner = String::new();
    let mut is_readable = false;

    // Tên máy nằm trong HKLM SYSTEM (đổi tên cần admin nên không nằm ở HKCU).
    if let Ok(key) = hklm().open_subkey(
        r"SYSTEM\CurrentControlSet\Control\ComputerName\ComputerName",
    ) {
        computer_name = string(&key, "ComputerName").unwrap_or_default();
    }
    if computer_name.is_empty() {
        computer_name = tauri_plugin_os::hostname();
    }

    // Tổ chức + chủ sở hữu đăng ký.
    for hive in [&hklm(), &hkcu()] {
        if let Ok(key) = hive.open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") {
            if let Some(v) = string(&key, "RegisteredOrganization") {
                if !v.is_empty() {
                    organization = v;
                }
            }
            if let Some(v) = string(&key, "RegisteredOwner") {
                if !v.is_empty() {
                    registered_owner = v;
                }
            }
            is_readable = true;
        }
    }

    // Múi giờ: `tzutil /g` cho tzutil ID chính xác.
    let time_zone_tz_id = run("tzutil", &["/g"])
        .ok()
        .filter(|(ok, _, _)| *ok)
        .map(|(_, out, _)| out.trim().to_string())
        .unwrap_or_default();
    let time_zones = read_time_zones(&time_zone_tz_id);
    let time_zone_display = time_zones
        .iter()
        .find(|t| t.is_current)
        .map(|t| t.display.clone())
        .unwrap_or_default();

    // Locale từ `HKCU\Control Panel\International`.
    let locale = hkcu()
        .open_subkey(r"Control Panel\International")
        .ok()
        .map(|key| LocaleSettings {
            locale: string(&key, "LocaleName").unwrap_or_default(),
            short_date: string(&key, "sShortDate").unwrap_or_default(),
            // iTime: "0" = 12 giờ (kèm AM/PM), "1" = 24 giờ.
            // Đã đối chiếu: iTime=0 đi kèm sShortTime="h:mm tt".
            time_format_24h: string(&key, "iTime").as_deref() == Some("1"),
            short_time: string(&key, "sShortTime").unwrap_or_default(),
            decimal: string(&key, "sDecimal").unwrap_or_default(),
            thousand_sep: string(&key, "sThousand").unwrap_or_default(),
        })
        .unwrap_or_default();

    // Bàn phím: `HKCU\Keyboard Layout\Preload`, value "1" = "00000409".
    let keyboard_layout_label = hkcu()
        .open_subkey(r"Keyboard Layout\Preload")
        .ok()
        .and_then(|k| string(&k, "1"))
        .unwrap_or_default();
    // Giá trị lưu dạng hex 8 chữ số → parse hex.
    let keyboard_layout_id = u32::from_str_radix(
        keyboard_layout_label
            .split(';')
            .next()
            .unwrap_or("")
            .trim(),
        16,
    )
    .unwrap_or(0);
    let keyboard_layouts = read_keyboard_layouts(keyboard_layout_id);

    let user_name = std::env::var("USERNAME").unwrap_or_default();

    let countries: Vec<CountryOption> = COUNTRIES
        .iter()
        .map(|(locale, name)| CountryOption {
            locale: locale.to_string(),
            name: name.to_string(),
        })
        .collect();

    Ok(IdentitySettings {
        computer_name,
        organization,
        registered_owner,
        user_name,
        time_zone_tz_id,
        time_zone_display,
        locale,
        date_formats: DATE_FORMATS
            .iter()
            .map(|f| SelectOption {
                value: (*f).to_string(),
                label: (*f).to_string(),
            })
            .collect(),
        time_formats: TIME_FORMATS
            .iter()
            .map(|f| SelectOption {
                value: (*f).to_string(),
                label: (*f).to_string(),
            })
            .collect(),
        decimal_formats: DECIMAL_FORMATS
            .iter()
            .map(|f| SelectOption {
                value: (*f).to_string(),
                label: (*f).to_string(),
            })
            .collect(),
        thousand_formats: THOUSAND_FORMATS
            .iter()
            .map(|f| SelectOption {
                value: (*f).to_string(),
                label: (*f).to_string(),
            })
            .collect(),
        keyboard_layout_id,
        keyboard_layout_label,
        time_zones,
        countries,
        keyboard_layouts,
        is_readable,
    })
}

/// Áp dụng nhóm Định danh.
///
/// Mỗi field độc lập: field nào lỗi thì báo riêng field đó, không rollback
/// các field đã set thành công (đúng như Anhdv Boot Toolkit — người dùng
/// thấy rõ việc đã làm và việc chưa làm được).
fn apply_identity(patch: &IdentityPatch) -> AppResult<ApplyResult> {
    let mut applied: Vec<String> = Vec::new();
    let mut failed: Vec<String> = Vec::new();
    let mut requires_signout = false;

    // --- Tên máy: HKLM SYSTEM, cần admin ---
    if let Some(name) = patch.computer_name.as_ref().filter(|n| !n.trim().is_empty()) {
        let cleaned = name.trim();
        let len = cleaned.chars().count();
        if len > 15 {
            failed.push(format!("Tên máy quá 15 ký tự (hiện {len}): {cleaned}"));
        } else if cleaned.contains(char::is_whitespace)
            || cleaned.contains(['"', '\\', '/', ':', '*', '?', '<', '>', '|'])
        {
            failed.push(
                "Tên máy không được chứa khoảng trắng hoặc ký tự: \" \\ / : * ? < > |".into(),
            );
        } else {
            match open_for_write(
                &hklm(),
                r"SYSTEM\CurrentControlSet\Control\ComputerName\ComputerName",
            ) {
                Ok(key) => match write_string(&key, "ComputerName", cleaned) {
                    Ok(()) => {
                        applied.push(format!("Tên máy → {cleaned}"));
                        requires_signout = true;
                    }
                    Err(e) => failed.push(e),
                },
                Err(e) => failed.push(e),
            }
        }
    }

    // --- Tổ chức: HKLM, cần admin ---
    if let Some(org) = patch.organization.as_ref() {
        match open_for_write(&hklm(), r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") {
            Ok(key) => match write_string(&key, "RegisteredOrganization", org.trim()) {
                Ok(()) => applied.push(format!("Tổ chức → {}", org.trim())),
                Err(e) => failed.push(e),
            },
            Err(e) => failed.push(e),
        }
    }

    // --- Múi giờ: dùng `tzutil /s` (chính Windows xử lý đồng bộ các key) ---
    if let Some(tz) = patch.time_zone_tz_id.as_ref().filter(|t| !t.is_empty()) {
        match run("tzutil", &["/s", tz]) {
            Ok((true, _, _)) => {
                applied.push(format!("Múi giờ → {tz}"));
                requires_signout = true;
            }
            Ok((false, _, err)) => failed.push(map_cmd_err(&err, "Đổi múi giờ").to_string()),
            Err(e) => failed.push(e),
        }
    }

    // --- Locale: `HKCU\Control Panel\International` ---
    if let Some(locale) = patch.locale.as_ref() {
        match open_for_write(&hkcu(), r"Control Panel\International") {
            Ok(key) => {
                let mut ok = true;
                // Mỗi field ghi độc lập: field nào lỗi thì báo riêng field đó.
                let writes: [(&str, &Option<String>); 5] = [
                    ("LocaleName", &locale.locale),
                    ("sShortDate", &locale.short_date),
                    ("sShortTime", &locale.short_time),
                    ("sDecimal", &locale.decimal),
                    ("sThousand", &locale.thousand_sep),
                ];
                for (name, value) in writes {
                    let Some(v) = value else { continue };
                    if let Err(e) = write_string(&key, name, v) {
                        failed.push(e);
                        ok = false;
                    }
                }
                if let Some(v) = locale.time_format_24h {
                    // iTime: "0" = 12 giờ (AM/PM), "1" = 24 giờ.
                    let val = if v { "1" } else { "0" };
                    if let Err(e) = write_string(&key, "iTime", val) {
                        failed.push(e);
                        ok = false;
                    }
                }
                if ok {
                    applied.push("Định dạng ngày/giờ/số".into());
                }
            }
            Err(e) => failed.push(e),
        }
    }

    // --- Bàn phím: ghi `Preload` value "1" dạng hex 8 chữ số ---
    if let Some(kb) = patch.keyboard_layout_id {
        match open_for_write(&hkcu(), r"Keyboard Layout\Preload") {
            Ok(key) => {
                let value = format!("{kb:08x}");
                match write_string(&key, "1", &value) {
                    Ok(()) => applied.push(format!("Bàn phím → {value}")),
                    Err(e) => failed.push(e),
                }
            }
            Err(e) => failed.push(e),
        }
    }

    let message = if failed.is_empty() {
        format!("Đã áp dụng {} thiết lập Định danh", applied.len())
    } else {
        format!(
            "Đã áp dụng {} thiết lập, {} mục không thực hiện được",
            applied.len(),
            failed.len()
        )
    };

    Ok(ApplyResult {
        group: "identity".into(),
        success: failed.is_empty(),
        applied,
        failed,
        requires_signout,
        requires_explorer_restart: false,
        message,
    })
}

// =================================================================
// 2. CÁ NHÂN HÓA
// =================================================================

/// CLSID các biểu tượng Desktop. Value 0 = hiện, 1 = ẩn.
const DESKTOP_ICON_IDS: &[(&str, &str)] = &[
    ("this_pc", "{20D04FE0-3AEA-1069-A2D8-08002B30309D}"),
    ("network", "{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}"),
    ("recycle_bin", "{645FF040-5081-101B-9F08-00AA002F954E}"),
    ("user_files", "{59031a47-3f72-44a7-89c5-5595fe6b30ee}"),
    ("control_panel", "{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}"),
];

fn read_personalization() -> AppResult<PersonalizationSettings> {
    let personalize = hkcu().open_subkey(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize",
    );
    let is_readable = personalize.is_ok();

    // SystemUsesLightTheme: 1 = Light, 0 = Dark.
    // Một số build chỉ có AppsUseLightTheme → fallback qua giá trị đó.
    let uses_light_theme = personalize
        .as_ref()
        .ok()
        .and_then(|k| dword(k, "SystemUsesLightTheme"))
        .or_else(|| personalize.as_ref().ok().and_then(|k| dword(k, "AppsUseLightTheme")))
        .map(|v| v == 1)
        .unwrap_or(false);

    // ColorPrevalence dưới Themes\Personalize:
    //   0 = tắt, 1 = Start + taskbar, 2 = chỉ taskbar.
    let accent_on_start_taskbar = personalize
        .as_ref()
        .ok()
        .and_then(|k| dword(k, "ColorPrevalence"))
        .unwrap_or(1)
        .min(2);

    // ColorPrevalence dưới DWM: màu nhấn trên thanh tiêu đề & viền cửa sổ.
    let accent_on_title_bars = hkcu()
        .open_subkey(r"SOFTWARE\Microsoft\Windows\DWM")
        .ok()
        .and_then(|k| dword(&k, "ColorPrevalence"))
        .map(|v| v == 1)
        .unwrap_or(false);

    // Biểu tượng Desktop: ẩn khi value = 1. Thiếu value = hiện.
    let desktop = hkcu().open_subkey(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel",
    );
    let is_hidden = |clsid: &str| -> bool {
        desktop
            .as_ref()
            .ok()
            .and_then(|k| dword(k, clsid))
            .map(|v| v == 1)
            .unwrap_or(false)
    };
    let desktop_icons = DesktopIcons {
        this_pc: !is_hidden(DESKTOP_ICON_IDS[0].1),
        network: !is_hidden(DESKTOP_ICON_IDS[1].1),
        recycle_bin: !is_hidden(DESKTOP_ICON_IDS[2].1),
        user_files: !is_hidden(DESKTOP_ICON_IDS[3].1),
        control_panel: !is_hidden(DESKTOP_ICON_IDS[4].1),
    };

    let desktop_key = hkcu().open_subkey(r"Control Panel\Desktop");
    let wallpaper_path = desktop_key
        .as_ref()
        .ok()
        .and_then(|k| string(k, "Wallpaper"))
        .unwrap_or_default();
    let wallpaper_style = desktop_key
        .as_ref()
        .ok()
        .and_then(|k| string(k, "WallpaperStyle"))
        .and_then(|s| s.parse().ok())
        .unwrap_or(10);

    // Màu nhấn: Windows 11 lưu ở `Explorer\Accent\AccentColorMenu` (DWORD ABGR).
    // Windows 10 dùng `Explorer\Accent\AccentColor` (chuỗi hex).
    // Dùng `DWM\ColorizationColor` làm fallback cuối.
    let accent_abgr = hkcu()
        .open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Accent")
        .ok()
        .and_then(|k| dword(&k, "AccentColorMenu"))
        .or_else(|| {
            hkcu()
                .open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Accent")
                .ok()
                .and_then(|k| string(&k, "AccentColor"))
                .and_then(|s| u32::from_str_radix(s.trim(), 16).ok())
        })
        .or_else(|| {
            hkcu()
                .open_subkey(r"SOFTWARE\Microsoft\Windows\DWM")
                .ok()
                .and_then(|k| dword(&k, "ColorizationColor"))
        });

    let palette: Vec<AccentColor> = ACCENT_PALETTE
        .iter()
        .map(|(id, name, hex)| AccentColor {
            id: id.to_string(),
            name: name.to_string(),
            hex: (*hex).to_string(),
            abgr: hex_to_abgr(hex).unwrap_or(0),
        })
        .collect();

    let (accent_color_id, accent_color_hex) = match accent_abgr {
        Some(abgr) => {
            let matched = ACCENT_PALETTE
                .iter()
                .find(|(_, _, hex)| hex_to_abgr(hex) == Some(abgr));
            (
                matched
                    .map(|(id, _, _)| id.to_string())
                    .unwrap_or_else(|| "custom".into()),
                abgr_to_hex(abgr),
            )
        }
        None => (
            "windows.blue".into(),
            palette[0].hex.clone(),
        ),
    };

    // Ảnh màn hình khóa: Windows 11 lưu ở PersonalizationCSP (HKLM),
    // Windows 10 lưu ở HKCU\...\Personalization.
    let lock_screen_image = hkcu()
        .open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Personalization")
        .ok()
        .and_then(|k| string(&k, "LockScreenImage"))
        .or_else(|| {
            hklm()
                .open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\PersonalizationCSP")
                .ok()
                .and_then(|k| string(&k, "LockScreenImagePath"))
        })
        .unwrap_or_default();

    Ok(PersonalizationSettings {
        theme: if uses_light_theme { "light" } else { "dark" }.into(),
        uses_light_theme,
        wallpaper_path,
        wallpaper_style,
        desktop_icons,
        accent_color_id,
        accent_color_hex,
        accent_palette: palette,
        accent_on_start_taskbar,
        accent_on_title_bars,
        lock_screen_image,
        is_readable,
    })
}

fn apply_personalization(patch: &PersonalizationPatch) -> AppResult<ApplyResult> {
    let mut applied: Vec<String> = Vec::new();
    let mut failed: Vec<String> = Vec::new();
    let mut requires_explorer_restart = false;
    let mut requires_signout = false;

    // --- Theme sáng/tối ---
    if let Some(theme) = patch.theme.as_ref() {
        if !matches!(theme.as_str(), "light" | "dark" | "custom") {
            failed.push(format!("Theme không hợp lệ: {theme}"));
        } else {
            let is_light = theme == "light";
            match open_for_write(
                &hkcu(),
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize",
            ) {
                Ok(key) => {
                    let light = u32::from(is_light);
                    let mut ok = true;
                    if let Err(e) = write_dword(&key, "SystemUsesLightTheme", light) {
                        failed.push(e);
                        ok = false;
                    }
                    if let Err(e) = write_dword(&key, "AppsUseLightTheme", light) {
                        failed.push(e);
                        ok = false;
                    }
                    if ok {
                        applied.push(format!(
                            "Chủ đề → {}",
                            if is_light { "Sáng" } else { "Tối" }
                        ));
                        requires_explorer_restart = true;
                    }
                }
                Err(e) => failed.push(e),
            }
        }
    }

    // --- Hình nền ---
    if let Some(wallpaper) = patch.wallpaper_path.as_ref().filter(|p| !p.is_empty()) {
        if !std::path::Path::new(wallpaper).exists() {
            failed.push(format!("Ảnh không tồn tại: {wallpaper}"));
        } else {
            match open_for_write(&hkcu(), r"Control Panel\Desktop") {
                Ok(key) => {
                    let style = patch.wallpaper_style.unwrap_or(10).to_string();
                    let mut ok = true;
                    if let Err(e) = write_string(&key, "Wallpaper", wallpaper) {
                        failed.push(e);
                        ok = false;
                    }
                    if let Err(e) = write_string(&key, "WallpaperStyle", &style) {
                        failed.push(e);
                        ok = false;
                    }
                    if let Err(e) = write_string(&key, "TileWallpaper", "0") {
                        failed.push(e);
                        ok = false;
                    }
                    if ok {
                        applied.push("Hình nền Desktop".into());
                        requires_explorer_restart = true;
                    }
                }
                Err(e) => failed.push(e),
            }
        }
    }

    // --- Ảnh màn hình khóa ---
    if let Some(lock) = patch.lock_screen_image.as_ref() {
        if !lock.is_empty() && !std::path::Path::new(lock).exists() {
            failed.push(format!("Ảnh màn hình khóa không tồn tại: {lock}"));
        } else {
            match open_for_write(
                &hkcu(),
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Personalization",
            ) {
                Ok(key) => match write_string(&key, "LockScreenImage", lock) {
                    Ok(()) => {
                        applied.push("Ảnh màn hình khóa".into());
                        requires_signout = true;
                    }
                    Err(e) => failed.push(e),
                },
                Err(e) => failed.push(e),
            }
        }
    }

    // --- Biểu tượng Desktop ---
    if let Some(icons) = patch.desktop_icons.as_ref() {
        let path =
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel";
        match open_for_write(&hkcu(), path) {
            Ok(key) => {
                let flags = [
                    ("this_pc", icons.this_pc),
                    ("network", icons.network),
                    ("recycle_bin", icons.recycle_bin),
                    ("user_files", icons.user_files),
                    ("control_panel", icons.control_panel),
                ];
                let mut ok = true;
                for (field, visible) in flags {
                    let Some((_, clsid)) = DESKTOP_ICON_IDS.iter().find(|(f, _)| *f == field) else {
                        continue;
                    };
                    // Quy ước Windows: 0 = hiện, 1 = ẩn.
                    let v = u32::from(!visible);
                    if let Err(e) = write_dword(&key, clsid, v) {
                        failed.push(format!("Biểu tượng {field}: {e}"));
                        ok = false;
                    }
                }
                if ok {
                    applied.push("Biểu tượng Desktop".into());
                    requires_explorer_restart = true;
                }
            }
            Err(e) => failed.push(e),
        }
    }

    // --- Màu nhấn ---
    if let Some(accent_id) = patch.accent_color_id.as_ref() {
        // Chấp nhận cả mã trong bảng màu lẫn hex tự nhập ("#RRGGBB").
        let abgr = ACCENT_PALETTE
            .iter()
            .find(|(id, _, _)| *id == accent_id)
            .and_then(|(_, _, hex)| hex_to_abgr(hex))
            .or_else(|| hex_to_abgr(accent_id));

        match abgr {
            Some(abgr) => {
                // Ghi cả 2 nơi để tương thích Win10 (AccentColor) và
                // Win11 (AccentColorMenu / StartColorMenu).
                let accent_key_path =
                    r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Accent";
                let mut ok = true;
                match open_for_write(&hkcu(), accent_key_path) {
                    Ok(key) => {
                        if let Err(e) = write_dword(&key, "AccentColorMenu", abgr) {
                            failed.push(e);
                            ok = false;
                        }
                        if let Err(e) = write_dword(&key, "StartColorMenu", abgr) {
                            failed.push(e);
                            ok = false;
                        }
                        // Win10 dùng chuỗi hex không có byte alpha.
                        if let Err(e) = write_string(&key, "AccentColor", &format!("{:X}", abgr & 0x00FF_FFFF)) {
                            failed.push(e);
                        }
                    }
                    Err(e) => {
                        failed.push(e);
                        ok = false;
                    }
                }
                // DWM\ColorizationColor = màu viền cửa sổ.
                match open_for_write(&hkcu(), r"SOFTWARE\Microsoft\Windows\DWM") {
                    Ok(key) => {
                        if let Err(e) = write_dword(&key, "ColorizationColor", abgr) {
                            failed.push(e);
                            ok = false;
                        }
                    }
                    Err(e) => {
                        failed.push(e);
                        ok = false;
                    }
                }
                if ok {
                    applied.push(format!("Màu nhấn → {}", abgr_to_hex(abgr)));
                    requires_explorer_restart = true;
                }
            }
            None => failed.push(format!("Mã màu nhấn không hợp lệ: {accent_id}")),
        }
    }

    // --- Màu nhấn trên Start & taskbar ---
    if let Some(v) = patch.accent_on_start_taskbar {
        if v > 2 {
            failed.push(format!("Giá trị ColorPrevalence không hợp lệ: {v}"));
        } else {
            match open_for_write(
                &hkcu(),
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize",
            ) {
                Ok(key) => match write_dword(&key, "ColorPrevalence", v) {
                    Ok(()) => {
                        applied.push(format!(
                            "Màu nhấn Start/taskbar → {}",
                            match v {
                                1 => "Bật (cả hai)",
                                2 => "Chỉ thanh tác vụ",
                                _ => "Tắt",
                            }
                        ));
                        requires_explorer_restart = true;
                    }
                    Err(e) => failed.push(e),
                },
                Err(e) => failed.push(e),
            }
        }
    }

    // --- Màu nhấn trên thanh tiêu đề & viền cửa sổ (DWM) ---
    if let Some(on) = patch.accent_on_title_bars {
        match open_for_write(&hkcu(), r"SOFTWARE\Microsoft\Windows\DWM") {
            Ok(key) => match write_dword(&key, "ColorPrevalence", u32::from(on)) {
                Ok(()) => {
                    applied.push(format!(
                        "Màu nhấn thanh tiêu đề → {}",
                        if on { "Bật" } else { "Tắt" }
                    ));
                    requires_explorer_restart = true;
                }
                Err(e) => failed.push(e),
            },
            Err(e) => failed.push(e),
        }
    }

    // Explorer cần restart mới nạp lại theme/hình nền/biểu tượng.
    if requires_explorer_restart {
        restart_explorer();
    }

    let message = if failed.is_empty() {
        format!("Đã áp dụng {} thiết lập Cá nhân hóa", applied.len())
    } else {
        format!(
            "Đã áp dụng {} thiết lập, {} mục không thực hiện được",
            applied.len(),
            failed.len()
        )
    };

    Ok(ApplyResult {
        group: "personalization".into(),
        success: failed.is_empty(),
        applied,
        failed,
        requires_signout,
        requires_explorer_restart,
        message,
    })
}

// =================================================================
// 3. PIN & NGUỒN
// =================================================================

/// Đọc giá trị AC và DC của 1 setting trong power scheme.
///
/// `powercfg /query <guid> <SUB_GROUP> <SETTING>` in ra cả 2 dòng:
///   Current AC Power Setting Index: 0x00000258
///   Current DC Power Setting Index: 0x00000258
fn power_ac_dc(guid: &str, sub_group: &str, setting: &str) -> (Option<u32>, Option<u32>) {
    let Ok((_, stdout, _)) = run("powercfg", &["/query", guid, sub_group, setting]) else {
        return (None, None);
    };
    let mut ac = None;
    let mut dc = None;
    for line in stdout.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("Current AC Power Setting Index:") {
            ac = u32::from_str_radix(rest.trim().trim_start_matches("0x"), 16).ok();
        } else if let Some(rest) = t.strip_prefix("Current DC Power Setting Index:") {
            dc = u32::from_str_radix(rest.trim().trim_start_matches("0x"), 16).ok();
        }
    }
    (ac, dc)
}

fn read_power() -> AppResult<PowerSettings> {
    // Scheme đang active.
    let (active_scheme_guid, _active_name) = match run("powercfg", &["/GETACTIVESCHEME"]) {
        Ok((true, stdout, _)) => {
            let guid = stdout
                .split("GUID:")
                .nth(1)
                .and_then(|s| s.split_whitespace().next())
                .unwrap_or("")
                .to_string();
            let name = stdout
                .rsplit('(')
                .nth(1)
                .map(|s| s.trim_end_matches(')').trim().to_string())
                .unwrap_or_default();
            (guid, name)
        }
        _ => (String::new(), String::new()),
    };
    let active_plan = power_plan_key(&active_scheme_guid).to_string();

    // Danh sách scheme có sẵn — `powercfg /list` in:
    //   Power Scheme GUID: 381b4222-...  (Balanced)
    // nên phải cắt sau "GUID:" (không phải token đầu tiên).
    let mut available_plans: Vec<PowerPlanOption> = Vec::new();
    if let Ok((true, stdout, _)) = run("powercfg", &["/list"]) {
        for line in stdout.lines() {
            let t = line.trim();
            let Some(rest) = t.strip_prefix("Power Scheme GUID:") else {
                continue;
            };
            let rest = rest.trim();
            let Some((guid, name_part)) = rest.split_once('(') else {
                continue;
            };
            let guid = guid.trim().to_ascii_lowercase();
            if guid.len() != 36 {
                continue;
            }
            // Tên trong ngoặc, bỏ dấu `*` (active) ở cuối.
            let name = name_part
                .trim_end_matches(')')
                .trim()
                .trim_end_matches('*')
                .trim()
                .to_string();
            available_plans.push(PowerPlanOption {
                is_active: guid == active_scheme_guid.to_ascii_lowercase(),
                guid: guid.clone(),
                key: power_plan_key(&guid).to_string(),
                name,
            });
        }
    }

    // Timeout (tính bằng giây). Alias chuẩn của powercfg:
    //   SUB_VIDEO VIDEOIDLE     = tắt màn hình
    //   SUB_SLEEP STANDBYIDLE   = thời gian ngủ
    //   SUB_SLEEP HIBERNATEIDLE = tắt hẳn máy
    let sleep = power_ac_dc(&active_scheme_guid, "SUB_SLEEP", "STANDBYIDLE");
    let monitor = power_ac_dc(&active_scheme_guid, "SUB_VIDEO", "VIDEOIDLE");
    let hibernate = power_ac_dc(&active_scheme_guid, "SUB_SLEEP", "HIBERNATEIDLE");

    let battery = query_battery().unwrap_or_else(|| BatteryStatus {
        name: String::new(),
        has_battery: false,
        status: "Not present".into(),
        charge_percent: None,
        estimated_minutes_remaining: None,
        design_capacity_mwh: None,
        full_charge_capacity_mwh: None,
    });

    Ok(PowerSettings {
        active_plan,
        active_scheme_guid,
        available_plans,
        monitor_timeout_ac: monitor.0.unwrap_or(0),
        monitor_timeout_dc: monitor.1.unwrap_or(0),
        sleep_timeout_ac: sleep.0.unwrap_or(0),
        sleep_timeout_dc: sleep.1.unwrap_or(0),
        hibernate_timeout_ac: hibernate.0.unwrap_or(0),
        hibernate_timeout_dc: hibernate.1.unwrap_or(0),
        battery,
    })
}

/// Đọc pin qua WMI. Mỗi lần gọi tạo COM connection riêng (tránh apartment issue).
fn query_battery() -> Option<BatteryStatus> {
    let com = wmi::COMLibrary::new().ok()?;
    let conn = wmi::WMIConnection::new(com).ok()?;
    let rows: Vec<HashMap<String, wmi::Variant>> = conn
        .raw_query(
            "SELECT Name, Status, EstimatedChargeRemaining, EstimatedRunTime FROM Win32_Battery",
        )
        .ok()?;
    let row = rows.into_iter().next()?;

    let name = match row.get("Name") {
        Some(wmi::Variant::String(s)) => s.clone(),
        _ => String::new(),
    };
    let status = match row.get("Status") {
        Some(wmi::Variant::String(s)) => s.clone(),
        Some(wmi::Variant::UI2(n)) => n.to_string(),
        Some(wmi::Variant::UI4(n)) => n.to_string(),
        Some(wmi::Variant::UI8(n)) => n.to_string(),
        _ => String::new(),
    };
    let percent = row
        .get("EstimatedChargeRemaining")
        .and_then(|v| match v {
            wmi::Variant::UI2(n) => Some(*n as u32),
            wmi::Variant::UI4(n) => Some(*n),
            wmi::Variant::UI8(n) => Some(*n as u32),
            wmi::Variant::I4(n) => Some(*n as u32),
            wmi::Variant::String(s) => s.parse().ok(),
            _ => None,
        })
        // 255 = không xác định → coi như không có.
        .filter(|p| *p <= 100);
    let minutes = row
        .get("EstimatedRunTime")
        .and_then(|v| match v {
            wmi::Variant::UI2(n) => Some(*n as u32),
            wmi::Variant::UI4(n) => Some(*n),
            wmi::Variant::UI8(n) => Some(*n as u32),
            wmi::Variant::I4(n) => Some(*n as u32),
            wmi::Variant::String(s) => s.parse().ok(),
            _ => None,
        })
        // 0xFFFFFFFF = không ước tính được.
        .filter(|m| *m != 0xFFFF_FFFF);

    Some(BatteryStatus {
        name,
        has_battery: true,
        status,
        charge_percent: percent,
        estimated_minutes_remaining: minutes,
        design_capacity_mwh: None,
        full_charge_capacity_mwh: None,
    })
}

fn apply_power(patch: &PowerPatch) -> AppResult<ApplyResult> {
    let mut applied: Vec<String> = Vec::new();
    let mut failed: Vec<String> = Vec::new();

    // --- Gói nguồn ---
    if let Some(key) = patch.plan.as_ref() {
        let guid = match key.as_str() {
            "balanced" => "381b4222-f694-41f0-9685-ff5bb260df2e",
            "high" => "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
            "power_saver" => "a1841308-3541-4fab-bc81-f71556f20b4a",
            // Ultimate Performance phải bật trước bằng `powercfg /duplicatescheme`.
            "ultimate" => "e9a42b02-d5df-448d-aa00-03f14749eb61",
            other => {
                failed.push(format!("Gói nguồn không hợp lệ: {other}"));
                return Ok(ApplyResult {
                    group: "power".into(),
                    success: false,
                    applied,
                    failed,
                    requires_signout: false,
                    requires_explorer_restart: false,
                    message: "Gói nguồn không hợp lệ".into(),
                });
            }
        };
        match run("powercfg", &["/SETACTIVE", guid]) {
            Ok((true, _, _)) => applied.push(format!("Gói nguồn → {key}")),
            Ok((false, _, err)) => failed.push(map_cmd_err(&err, "Đổi gói nguồn").to_string()),
            Err(e) => failed.push(e),
        }
    }

    // --- Timeout: monitor / sleep / hibernate ---
    // Mỗi setting có 2 giá trị (AC = cắm sạc, DC = dùng pin) → 2 lệnh.
    let timeouts: [(&str, &str, &str, Option<u32>, Option<u32>); 3] = [
        (
            "Tắt màn hình",
            "SUB_VIDEO",
            "VIDEOIDLE",
            patch.monitor_timeout_ac,
            patch.monitor_timeout_dc,
        ),
        (
            "Thời gian ngủ",
            "SUB_SLEEP",
            "STANDBYIDLE",
            patch.sleep_timeout_ac,
            patch.sleep_timeout_dc,
        ),
        (
            "Tắt hẳn máy",
            "SUB_SLEEP",
            "HIBERNATEIDLE",
            patch.hibernate_timeout_ac,
            patch.hibernate_timeout_dc,
        ),
    ];

    for (label, sub_group, setting, ac, dc) in timeouts {
        if ac.is_none() && dc.is_none() {
            continue;
        }
        // `SCHEME_CURRENT` = scheme đang active.
        for (kind, value) in [("AC", ac), ("DC", dc)] {
            let Some(seconds) = value else { continue };
            let hex = format!("0x{seconds:08x}");
            // /SETACVALUEINDEX hoặc /SETDCVALUEINDEX.
            let flag = format!("/SET{kind}VALUEINDEX");
            match run(
                "powercfg",
                &[
                    flag.as_str(),
                    "SCHEME_CURRENT",
                    sub_group,
                    setting,
                    hex.as_str(),
                ],
            ) {
                Ok((true, _, _)) => {}
                Ok((false, _, err)) => {
                    failed.push(map_cmd_err(&err, &format!("{label} ({kind})")).to_string())
                }
                Err(e) => failed.push(e),
            }
        }
        applied.push(format!(
            "{label}: {} (cắm sạc) / {} (pin)",
            fmt_timeout(ac),
            fmt_timeout(dc)
        ));
    }

    // Đẩy thay đổi xuống hệ thống (powercfg cần setactive lại để ghi).
    if !applied.is_empty() {
        let _ = run("powercfg", &["/SETACTIVE", "SCHEME_CURRENT"]);
    }

    let message = if failed.is_empty() {
        "Đã áp dụng thiết lập Pin & Nguồn".into()
    } else {
        format!(
            "Đã áp dụng {} mục, {} mục không thực hiện được",
            applied.len(),
            failed.len()
        )
    };

    Ok(ApplyResult {
        group: "power".into(),
        success: failed.is_empty(),
        applied,
        failed,
        requires_signout: false,
        requires_explorer_restart: false,
        message,
    })
}

/// Đổi giây sang nhãn tiếng Việt. 0 = "Không bao giờ".
fn fmt_timeout(seconds: Option<u32>) -> String {
    match seconds {
        None => "không đổi".into(),
        Some(0) => "Không bao giờ".into(),
        Some(s) if s % 3600 == 0 => format!("{} giờ", s / 3600),
        Some(s) if s % 60 == 0 => format!("{} phút", s / 60),
        Some(s) => format!("{s} giây"),
    }
}

// =================================================================
// 4. KÍCH HOẠT
// =================================================================

/// Đọc trạng thái license Windows.
///
/// Chỉ ĐỌC — module này cố tình không cung cấp lệnh cài key.
/// LicenseStatus: 0 = Unlicensed, 1 = Licensed.
fn read_activation() -> AppResult<ActivationStatus> {
    let com = wmi::COMLibrary::new()
        .map_err(|e| AppError::Wmi(format!("Không khởi tạo COM: {e}")))?;
    let conn = wmi::WMIConnection::new(com)
        .map_err(|e| AppError::Wmi(format!("Không kết nối WMI: {e}")))?;

    let rows: Vec<HashMap<String, wmi::Variant>> = conn
        .raw_query(
            "SELECT LicenseStatus, Description, PartialProductKey, GracePeriodRemaining \
             FROM SoftwareLicensingProduct \
             WHERE ApplicationID = '55c92734-d682-4d71-983e-d6ec3f16059f' \
             AND PartialProductKey IS NOT NULL",
        )
        .map_err(|e| AppError::Wmi(e.to_string()))?;

    let row = rows
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Other("Không tìm thấy thông tin kích hoạt Windows".into()))?;

    let status_code = match row.get("LicenseStatus") {
        Some(wmi::Variant::UI2(n)) => *n as u32,
        Some(wmi::Variant::UI4(n)) => *n,
        Some(wmi::Variant::UI8(n)) => *n as u32,
        Some(wmi::Variant::I4(n)) => *n as u32,
        Some(wmi::Variant::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    };
    let description = match row.get("Description") {
        Some(wmi::Variant::String(s)) => s.clone(),
        _ => license_status_text(status_code),
    };
    let partial_product_key = match row.get("PartialProductKey") {
        Some(wmi::Variant::String(s)) => Some(s.clone()),
        _ => None,
    };
    let grace_period_days = row
        .get("GracePeriodRemaining")
        .and_then(|v| match v {
            wmi::Variant::UI2(n) => Some(*n as u32),
            wmi::Variant::UI4(n) => Some(*n),
            wmi::Variant::UI8(n) => Some(*n as u32),
            wmi::Variant::I4(n) => Some(*n as u32),
            wmi::Variant::String(s) => s.parse().ok(),
            _ => None,
        })
        // 4294967295 = không áp dụng.
        .filter(|d| *d <= 3650);

    Ok(ActivationStatus {
        activated: status_code == 1,
        status_code,
        description,
        partial_product_key,
        grace_period_days,
    })
}

/// Dịch mã LicenseStatus sang tiếng Việt.
fn license_status_text(code: u32) -> String {
    match code {
        0 => "Chưa kích hoạt".into(),
        1 => "Đã kích hoạt".into(),
        2 => "Đang chờ cấp phép".into(),
        3 => "Đã kích hoạt (giảm dùng thử)".into(),
        4 => "Notification mode".into(),
        5 => "Notification (Grace Period)".into(),
        6 => "Notification (Out of Tolerance)".into(),
        _ => format!("Không xác định (mã {code})"),
    }
}

// =================================================================
// Tauri commands
// =================================================================

#[tauri::command]
pub async fn get_identity_settings() -> AppResult<IdentitySettings> {
    tauri::async_runtime::spawn_blocking(read_identity)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn apply_identity_settings(patch: IdentityPatch) -> AppResult<ApplyResult> {
    tauri::async_runtime::spawn_blocking(move || apply_identity(&patch))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_personalization_settings() -> AppResult<PersonalizationSettings> {
    tauri::async_runtime::spawn_blocking(read_personalization)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn apply_personalization_settings(
    patch: PersonalizationPatch,
) -> AppResult<ApplyResult> {
    tauri::async_runtime::spawn_blocking(move || apply_personalization(&patch))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_power_settings() -> AppResult<PowerSettings> {
    tauri::async_runtime::spawn_blocking(read_power)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn apply_power_settings(patch: PowerPatch) -> AppResult<ApplyResult> {
    tauri::async_runtime::spawn_blocking(move || apply_power(&patch))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_activation_status() -> AppResult<ActivationStatus> {
    tauri::async_runtime::spawn_blocking(read_activation)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn refresh_explorer() -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(|| {
        restart_explorer();
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}
