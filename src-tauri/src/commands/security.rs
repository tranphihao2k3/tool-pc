//! Security / Windows Defender commands (Task 7 - UX-20..24).
//!
//! Tất cả command đều wrap PowerShell `*-Mp*` cmdlets — đây là cách Microsoft
//! support chính thức, không cần bind COM trực tiếp. Một số tính năng cần admin
//! (Set-MpPreference, Add-MpPreference) — frontend sẽ detect qua error.
//!
//! Lưu ý quan trọng:
//! - Defender PowerShell module chỉ có trên Win 10 1709+ / Win 11
//! - Trên các bản cũ hoặc khi Defender bị disabled bởi AV khác → trả `available=false`
//! - KHÔNG tự ý run "Remove-MpThreat" — chỉ Quarantine / Allow / Delete do user chọn
//! - File EICAR test để test scan: https://www.eicar.org/download/eicar.com

use crate::domain::{FirewallProfile, Threat};
use crate::AppResult;
use std::process::Command as StdCommand;
use std::time::Instant;

// =================================================================
// Inner helpers - PowerShell wrapper
// =================================================================

/// Chạy PowerShell command, trả về stdout. Nếu lệnh fail mà `ignore_error=true`
/// thì trả Ok("") thay vì Err.
fn run_ps(ps_command: &str, ignore_error: bool) -> AppResult<String> {
    let output = StdCommand::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            ps_command,
        ])
        .output()
        .map_err(|e| crate::AppError::Other(format!("Không thể chạy PowerShell: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() && !ignore_error {
        // Các lỗi hay gặp: "Run as admin", "module not found" (Defender disabled), ...
        let lower = stderr.to_lowercase();
        if lower.contains("access is denied")
            || lower.contains("requires elevation")
            || lower.contains("administrator")
        {
            return Err(crate::AppError::Permission(stderr.trim().to_string()));
        }
        if lower.contains("not recognized")
            || lower.contains("cannot find")
            || lower.contains("module")
        {
            return Err(crate::AppError::NotImplemented(
                "Windows Defender PowerShell module không khả dụng (Win 10 1709+ cần thiết, hoặc Defender đã bị disable)".into(),
            ));
        }
        return Err(crate::AppError::Other(stderr.trim().to_string()));
    }

    Ok(stdout)
}

/// Kiểm tra Defender có available không — check bằng cách thử gọi Get-MpComputerStatus.
pub fn is_defender_available() -> bool {
    let r = StdCommand::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "Get-MpComputerStatus | Out-Null; $true",
        ])
        .output();
    matches!(r, Ok(o) if o.status.success())
}

// =================================================================
// Status (UX-20)
// =================================================================

/// Lấy trạng thái tổng quan Defender. Một số field PowerShell trả camelCase, một số PascalCase.
pub fn get_defender_status_inner() -> AppResult<serde_json::Value> {
    let start = Instant::now();

    // 1. Get-MpComputerStatus
    let status_ps = r#"
        Get-MpComputerStatus |
        Select-Object AntivirusEnabled, RealTimeProtectionEnabled, BehaviorMonitoringEnabled,
            CloudProtectionLevel, SignatureLastUpdated, SignatureVersion,
            AMServiceVersion, AMEngineVersion, QuickScanAge, FullScanAge |
        ConvertTo-Json
    "#;
    let raw = run_ps(status_ps, true)?;

    // 2. Threat count
    let threats_ps = r#"
        try { (Get-MpThreat).Count } catch { 0 }
    "#;
    let threats_raw = run_ps(threats_ps, true).unwrap_or_else(|_| "0".into());

    let mut status: serde_json::Value = if raw.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}))
    };

    // Patch threats count
    if let Some(obj) = status.as_object_mut() {
        let threats_count: i64 = threats_raw.trim().parse().unwrap_or(0);
        obj.insert("threatCount".into(), serde_json::json!(threats_count));
        obj.insert("available".into(), serde_json::json!(true));
    }

    let _ = start; // có thể log duration sau
    Ok(status)
}

// =================================================================
// Scan (UX-20)
// =================================================================

/// Bắt đầu một scan — trả về job ngay (scan chạy async trong PowerShell background).
///
/// Lưu ý: PowerShell `Start-MpScan` chạy đồng bộ; với full scan có thể vài giờ.
/// Trong tương lai sẽ chạy qua background job (`Start-Job`) để UI không bị block.
pub fn start_defender_scan_inner(scan_type: &str, scan_path: Option<&str>) -> AppResult<serde_json::Value> {
    let cmd = match scan_type {
        "quick" => "Start-MpScan -ScanType QuickScan".to_string(),
        "full" => "Start-MpScan -ScanType FullScan".to_string(),
        "custom" => {
            let p = scan_path.unwrap_or("C:\\Users");
            format!("Start-MpScan -ScanType CustomScan -ScanPath '{}'", p.replace('\'', "''"))
        }
        other => return Err(crate::AppError::Other(format!("Invalid scan type: {other}"))),
    };

    let started = chrono_lite_now_ms();
    let result = run_ps(&cmd, false);
    let finished = chrono_lite_now_ms();

    let (status, message) = match result {
        Ok(_) => ("completed".to_string(), "Scan hoàn tất".to_string()),
        Err(e) => ("failed".to_string(), e.to_string()),
    };

    // Đếm threat hiện tại sau khi scan (Get-MpThreat), fallback 0 nếu module lỗi.
    let threats_found = get_threat_count_inner().unwrap_or(0);

    Ok(serde_json::json!({
        "id": format!("scan-{started}"),
        "scanType": scan_type,
        "scanPath": scan_path,
        "startedAtMs": started,
        "finishedAtMs": finished,
        "status": status,
        "threatsFound": threats_found,
        "filesScanned": 0,
        "message": message,
    }))
}

/// Lấy threat count hiện tại (gọi sau scan để update job).
pub fn get_threat_count_inner() -> AppResult<usize> {
    let raw = run_ps("(Get-MpThreat).Count", true).unwrap_or_else(|_| "0".into());
    Ok(raw.trim().parse().unwrap_or(0))
}

// =================================================================
// Threats (UX-21)
// =================================================================

/// Liệt kê threats hiện tại.
pub fn get_threats_inner() -> AppResult<Vec<Threat>> {
    let ps = r#"
        Get-MpThreat |
        Select-Object ThreatID, ThreatName, Path, IsQuarantined, Severity, CategoryName, InitialDetectionTime, ActionSuccess |
        ConvertTo-Json -Depth 3
    "#;

    let raw = run_ps(ps, true)?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }

    // PowerShell trả object (không phải array) nếu chỉ có 1 item
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| crate::AppError::Other(format!("Parse threat list failed: {e}")))?;

    let arr = match parsed {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Object(_) => vec![parsed],
        _ => return Ok(Vec::new()),
    };

    let threats = arr
        .into_iter()
        .filter_map(|v| {
            let get_str = |k: &str| {
                v.get(k)
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string()
            };
            Some(Threat {
                threat_id: get_str("ThreatID"),
                name: get_str("ThreatName"),
                path: get_str("Path"),
                is_quarantined: v
                    .get("IsQuarantined")
                    .and_then(|x| x.as_bool())
                    .unwrap_or(false),
                severity: match get_str("Severity").as_str() {
                    "Low" => crate::domain::ThreatSeverity::Low,
                    "Moderate" => crate::domain::ThreatSeverity::Moderate,
                    "High" => crate::domain::ThreatSeverity::High,
                    "Severe" => crate::domain::ThreatSeverity::Severe,
                    _ => crate::domain::ThreatSeverity::Unknown,
                },
                category: get_str("CategoryName"),
                detected_at: get_str("InitialDetectionTime"),
                action: get_str("ActionSuccess"),
            })
        })
        .collect();

    Ok(threats)
}

/// Action lên threat: quarantine | remove | allow | restore.
/// - "quarantine": Add-MpPreference -ThreatIDDefaultActionQuarantine
/// - "remove": Remove-MpThreat -ThreatID
/// - "allow": Add-MpPreference -ThreatIDDefaultActionAllow
/// - "restore": Restore-MpThreat -ThreatID
pub fn act_on_threat_inner(threat_id: &str, action: &str) -> AppResult<String> {
    if threat_id.is_empty() {
        return Err(crate::AppError::Other("threat_id trống".into()));
    }
    let id = threat_id.replace('\'', "''");
    let cmd = match action {
        "quarantine" => format!(
            "Start-MpScan -ScanType CustomScan -ScanPath (Get-MpThreat -ThreatID '{id}' | Select-Object -ExpandProperty Path); \
             try {{ Add-MpPreference -ThreatIDDefaultAction Quarantine -ThreatID '{id}' }} catch {{}}"
        ),
        "remove" => format!("Remove-MpThreat -ThreatID '{id}' -Force -ErrorAction Stop"),
        "allow" => format!(
            "Add-MpPreference -ThreatIDDefaultAction Allow -ThreatID '{id}' -ErrorAction Stop"
        ),
        "restore" => format!("Restore-MpThreat -ThreatID '{id}' -ErrorAction Stop"),
        other => return Err(crate::AppError::Other(format!("Unknown action: {other}"))),
    };

    run_ps(&cmd, false)?;
    Ok(format!("Đã {action} threat {id}"))
}

// =================================================================
// Preferences / Settings (UX-22)
// =================================================================

/// Đọc Defender preferences — trả về JSON để frontend hiển thị.
pub fn get_defender_preferences_inner() -> AppResult<serde_json::Value> {
    let ps = r#"
        $keys = @(
            'DisableAntiSpyware','DisableRealtimeMonitoring','DisableBehaviorMonitoring',
            'DisableScriptScanning','DisableArchiveScanning',
            'PUAProtection','SubmitSamplesConsent',
            'CloudProtection','CloudBlockLevel','CloudExtendedTimeout',
            'ArchiveMaxDepth','EmailContentMaxSize'
        )
        $out = @()
        foreach ($k in $keys) {
            $v = (Get-MpPreference).$k
            $out += [PSCustomObject]@{ Key = $k; Value = "$v" }
        }
        $out | ConvertTo-Json
    "#;
    let raw = run_ps(ps, true)?;
    if raw.trim().is_empty() {
        return Ok(serde_json::json!([]));
    }
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| crate::AppError::Other(format!("Parse preferences failed: {e}")))?;
    Ok(parsed)
}

/// Set một preference. `key` phải nằm trong whitelist — KHÔNG cho phép tùy ý
/// để tránh user set những key nguy hiểm như `DisableAntiSpyware=true`.
pub fn set_defender_preference_inner(key: &str, value: &str) -> AppResult<String> {
    const ALLOWED: &[&str] = &[
        "DisableRealtimeMonitoring",
        "DisableBehaviorMonitoring",
        "DisableScriptScanning",
        "DisableArchiveScanning",
        "PUAProtection",
        "SubmitSamplesConsent",
        "CloudProtection",
        "CloudBlockLevel",
        "CloudExtendedTimeout",
        "ArchiveMaxDepth",
    ];
    if !ALLOWED.contains(&key) {
        return Err(crate::AppError::Permission(format!(
            "Key không cho phép: {key}. Cho phép: {ALLOWED:?}"
        )));
    }
    let cmd = format!("Set-MpPreference -{key} {value} -ErrorAction Stop");
    run_ps(&cmd, false)?;
    Ok(format!("Đã set {key} = {value}"))
}

/// Update Defender signatures.
pub fn update_defender_signatures_inner() -> AppResult<String> {
    run_ps("Update-MpSignature -ErrorAction Stop", false)?;
    Ok("Đã cập nhật chữ ký Defender".to_string())
}

// =================================================================
// Exclusions (UX-23)
// =================================================================

/// Lấy danh sách exclusions.
pub fn get_defender_exclusions_inner() -> AppResult<serde_json::Value> {
    let ps = r#"
        $prefs = Get-MpPreference
        $out = @()
        $i = 0
        foreach ($p in $prefs.ExclusionPath)  { $out += [PSCustomObject]@{ Id = "p-$i"; Type="Path";  Value=$p; Scope="System" }; $i++ }
        foreach ($p in $prefs.ExclusionProcess) { $out += [PSCustomObject]@{ Id = "proc-$i"; Type="Process"; Value=$p; Scope="System" }; $i++ }
        foreach ($p in $prefs.ExclusionExtension) { $out += [PSCustomObject]@{ Id = "ext-$i"; Type="FileType"; Value=$p; Scope="System" }; $i++ }
        $out | ConvertTo-Json
    "#;
    let raw = run_ps(ps, true)?;
    if raw.trim().is_empty() {
        return Ok(serde_json::json!([]));
    }
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| crate::AppError::Other(format!("Parse exclusions failed: {e}")))?;
    Ok(parsed)
}

/// Thêm exclusion. `excl_type` ∈ {Path, Process, FileType}.
pub fn add_defender_exclusion_inner(excl_type: &str, value: &str) -> AppResult<String> {
    if value.is_empty() {
        return Err(crate::AppError::Other("Giá trị trống".into()));
    }
    let v = value.replace('\'', "''");
    let cmd = match excl_type {
        "Path" => format!("Add-MpPreference -ExclusionPath '{v}' -ErrorAction Stop"),
        "Process" => format!("Add-MpPreference -ExclusionProcess '{v}' -ErrorAction Stop"),
        "FileType" => format!("Add-MpPreference -ExclusionExtension '{v}' -ErrorAction Stop"),
        other => return Err(crate::AppError::Other(format!("Unknown exclusion type: {other}"))),
    };
    run_ps(&cmd, false)?;
    Ok(format!("Đã thêm {excl_type} exclusion: {value}"))
}

/// Xóa exclusion.
pub fn remove_defender_exclusion_inner(excl_type: &str, value: &str) -> AppResult<String> {
    let v = value.replace('\'', "''");
    let cmd = match excl_type {
        "Path" => format!("Remove-MpPreference -ExclusionPath '{v}' -ErrorAction Stop"),
        "Process" => format!("Remove-MpPreference -ExclusionProcess '{v}' -ErrorAction Stop"),
        "FileType" => format!("Remove-MpPreference -ExclusionExtension '{v}' -ErrorAction Stop"),
        other => return Err(crate::AppError::Other(format!("Unknown exclusion type: {other}"))),
    };
    run_ps(&cmd, false)?;
    Ok(format!("Đã xóa {excl_type} exclusion: {value}"))
}

// =================================================================
// Firewall (UX-24)
// =================================================================

/// Đọc status của 3 firewall profile: Domain / Private / Public.
pub fn get_firewall_profiles_inner() -> AppResult<Vec<FirewallProfile>> {
    let ps = r#"
        Get-NetFirewallProfile |
        Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction, LogAllowed |
        ConvertTo-Json
    "#;
    let raw = run_ps(ps, true)?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| crate::AppError::Other(format!("Parse firewall failed: {e}")))?;

    let arr = match parsed {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Object(_) => vec![parsed],
        _ => return Ok(Vec::new()),
    };

    let profiles = arr
        .into_iter()
        .map(|v| {
            let get_str = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
            let name = match get_str("Name").as_str() {
                "Domain" => crate::domain::FirewallProfileName::Domain,
                "Private" => crate::domain::FirewallProfileName::Private,
                "Public" => crate::domain::FirewallProfileName::Public,
                _ => crate::domain::FirewallProfileName::Public,
            };
            let parse_action = |s: &str| match s {
                "Allow" => crate::domain::FirewallAction::Allow,
                "Block" => crate::domain::FirewallAction::Block,
                _ => crate::domain::FirewallAction::NotConfigured,
            };
            FirewallProfile {
                name,
                enabled: v.get("Enabled").and_then(|x| x.as_bool()).unwrap_or(false),
                inbound_action: parse_action(&get_str("DefaultInboundAction")),
                outbound_action: parse_action(&get_str("DefaultOutboundAction")),
                logging_enabled: v.get("LogAllowed").and_then(|x| x.as_bool()).unwrap_or(false),
            }
        })
        .collect();

    Ok(profiles)
}

/// Toggle firewall profile on/off.
pub fn set_firewall_profile_inner(profile: &str, enabled: bool) -> AppResult<String> {
    let p = match profile {
        "Domain" | "Private" | "Public" => profile,
        other => return Err(crate::AppError::Other(format!("Invalid profile: {other}"))),
    };
    let val = if enabled { "True" } else { "False" };
    let cmd = format!("Set-NetFirewallProfile -Name {p} -Enabled {val} -ErrorAction Stop");
    run_ps(&cmd, false)?;
    Ok(format!("Đã set firewall {p} = {enabled}"))
}

// =================================================================
// Helpers
// =================================================================

/// Trả về Unix epoch ms hiện tại — tránh thêm crate `chrono`.
fn chrono_lite_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// =================================================================
// Tauri commands
// =================================================================

#[tauri::command]
pub async fn get_defender_status() -> AppResult<serde_json::Value> {
    if !is_defender_available() {
        return Ok(serde_json::json!({
            "available": false,
            "serviceRunning": false,
            "antivirusEnabled": false,
            "realtimeEnabled": false,
            "behaviorMonitoringEnabled": false,
            "cloudProtectionLevel": 0,
            "signatureLastUpdated": null,
            "signatureVersion": "",
            "appVersion": "",
            "engineVersion": "",
            "quickScanAgeHours": null,
            "fullScanAgeHours": null,
            "threatCount": 0
        }));
    }
    tauri::async_runtime::spawn_blocking(get_defender_status_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn start_defender_scan(
    scan_type: String,
    scan_path: Option<String>,
) -> AppResult<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || {
        start_defender_scan_inner(&scan_type, scan_path.as_deref())
    })
    .await
    .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_threats() -> AppResult<Vec<Threat>> {
    tauri::async_runtime::spawn_blocking(get_threats_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn act_on_threat(threat_id: String, action: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || act_on_threat_inner(&threat_id, &action))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_defender_preferences() -> AppResult<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(get_defender_preferences_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn set_defender_preference(key: String, value: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || set_defender_preference_inner(&key, &value))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn update_defender_signatures() -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(update_defender_signatures_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_defender_exclusions() -> AppResult<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(get_defender_exclusions_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn add_defender_exclusion(excl_type: String, value: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || add_defender_exclusion_inner(&excl_type, &value))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn remove_defender_exclusion(excl_type: String, value: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        remove_defender_exclusion_inner(&excl_type, &value)
    })
    .await
    .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_firewall_profiles() -> AppResult<Vec<FirewallProfile>> {
    tauri::async_runtime::spawn_blocking(get_firewall_profiles_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn set_firewall_profile(profile: String, enabled: bool) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || set_firewall_profile_inner(&profile, enabled))
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}
