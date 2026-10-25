//! Domain structs trả về cho frontend.
//!
//! Tất cả serialize theo camelCase để khớp với TS types trong
//! `src/shared/types/system.ts`. Các trường realtime (load %, usage)
//! sẽ được update bằng event `realtime-stats` ở Task 10.

use serde::{Deserialize, Serialize};

// =================================================================
// OS
// =================================================================
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub product_name: String,
    pub display_version: String,
    pub build: String,
    pub ubr: u32,
    pub edition: String,
    pub installation_type: String,
    pub registered_owner: String,
    pub hostname: String,
    pub architecture: String,
    pub uptime_seconds: u64,
    pub activated: bool,
}

// =================================================================
// CPU
// =================================================================
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub name: String,
    pub manufacturer: String,
    pub cores: u32,
    pub threads: u32,
    pub base_clock_mhz: u32,
    pub current_clock_mhz: u32,
    pub l2_cache_kb: u32,
    pub l3_cache_kb: u32,
    pub socket: String,
    pub architecture: String,
    pub processor_id: String,
    pub family: String,
    pub stepping: String,
    pub load_percent: f32,
    pub per_core_load: Vec<f32>,
    pub temperature_c: Option<f32>,
}

// =================================================================
// RAM
// =================================================================
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RamStick {
    pub capacity_bytes: u64,
    pub speed_mhz: u32,
    pub manufacturer: String,
    pub part_number: String,
    pub device_locator: String,
    pub form_factor: String,
    pub memory_type: String,
    pub data_width_bits: u16,
    pub total_width_bits: u16,
    pub is_ecc: bool,
    pub configured_voltage: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RamInfo {
    pub sticks: Vec<RamStick>,
    pub total_slots: u32,
    pub used_slots: u32,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub cached_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
}

// =================================================================
// Mainboard / BIOS
// =================================================================
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MainboardInfo {
    pub manufacturer: String,
    pub product: String,
    pub version: String,
    pub serial_number: String,
    pub bios_vendor: String,
    pub bios_version: String,
    pub bios_release_date: String,
    pub system_manufacturer: String,
    pub system_model: String,
    pub system_family: String,
    pub system_type: String,
}

// =================================================================
// Disk
// =================================================================
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalDisk {
    pub model: String,
    pub interface_type: String,
    pub media_type: String,
    pub size_bytes: u64,
    pub serial_number: String,
    pub firmware: String,
    pub status: String,
    pub partitions: u32,
    pub bytes_per_sector: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicalVolume {
    pub device_id: String,
    pub label: String,
    pub file_system: String,
    pub size_bytes: u64,
    pub free_bytes: u64,
    pub volume_serial: String,
    pub drive_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub physical: Vec<PhysicalDisk>,
    pub logical: Vec<LogicalVolume>,
}

// =================================================================
// GPU
// =================================================================
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub adapter_compatibility: String,
    /// VRAM tổng (bytes). Lấy từ registry `HardwareInformation.qwMemorySize`
    /// (QWORD) nên chính xác với card > 4GB — `AdapterRAM` của WMI là UI32
    /// và bị driver bóp méo thành ≈4GB.
    pub vram_bytes: u64,
    /// VRAM đang dùng (bytes) — chỉ có với card NVIDIA.
    pub vram_used_bytes: Option<u64>,
    pub driver_version: String,
    pub driver_date: String,
    pub video_processor: String,
    pub current_resolution: String,
    pub current_refresh_rate: u32,
    pub max_refresh_rate: u32,
    pub is_discrete: bool,
    /// Nhiệt độ GPU (°C) — chỉ có với card NVIDIA.
    pub temperature_c: Option<f32>,
    /// % sử dụng GPU — NVIDIA lấy từ `nvidia-smi`, card khác lấy từ WMI.
    pub utilization_percent: Option<f32>,
}

// =================================================================
// Network
// =================================================================
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAdapter {
    pub name: String,
    pub description: String,
    pub mac_address: String,
    pub ipv4: Vec<String>,
    pub ipv6: Vec<String>,
    pub subnet: Vec<String>,
    pub gateway: Vec<String>,
    pub dns: Vec<String>,
    pub speed_bps: i64,
    pub interface_type: String,
    pub is_connected: bool,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

// =================================================================
// Software & Startup
// =================================================================
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    pub version: Option<String>,
    pub publisher: Option<String>,
    pub install_date: Option<String>,
    pub estimated_size_kb: Option<u64>,
    pub install_location: Option<String>,
    pub uninstall_string: Option<String>,
    pub architecture: String,
    pub source: String, // Registry32 | Registry64 | RegistryUser | AppX
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupProgram {
    pub name: String,
    pub command: String,
    pub location: String, // RegistryRun | RegistryRunOnce | TaskScheduler | StartupFolder
    pub scope: String,    // HKLM | HKCU
    pub enabled: bool,
    pub publisher: Option<String>,
    pub impact: String, // High | Medium | Low | Unknown
}

// =================================================================
// Driver
// =================================================================
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverInfo {
    pub device_name: String,
    pub device_class: String,
    pub current_version: String,
    pub driver_date: String,
    pub provider: String,
    pub inf_name: String,
    pub is_signed: bool,
    pub signer: String,
    pub hardware_id: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
}

// =================================================================
// Realtime stats — emit qua event mỗi 1s (Task 10)
// =================================================================
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeStats {
    pub cpu_percent: f32,
    pub ram_percent: f32,
    pub ram_used_bytes: u64,
    pub ram_total_bytes: u64,
    pub gpu_percent: Option<f32>,
    pub net_rx_bps: f64,
    pub net_tx_bps: f64,
    pub disk_read_bps: f64,
    pub disk_write_bps: f64,
    pub cpu_temp_c: Option<f32>,
    pub timestamp_ms: u64,
    // --- Bổ sung Task 13: số liệu chuẩn cho dashboard ---
    /// Tổng % sử dụng của ổ hệ thống (C:).
    pub disk_percent: f32,
    pub disk_used_bytes: u64,
    pub disk_total_bytes: u64,
    /// Tên ổ hệ thống (vd "C:").
    pub disk_system_drive: String,
    /// Xung nhịp CPU hiện tại (MHz).
    pub cpu_freq_mhz: u32,
    /// Tải từng core (%).
    pub per_core_load: Vec<f32>,
    /// Tên GPU (nếu phát hiện được).
    pub gpu_name: Option<String>,
    pub gpu_temp_c: Option<f32>,
    pub gpu_vram_used_bytes: Option<u64>,
    pub gpu_vram_total_bytes: Option<u64>,
}

// =================================================================
// Booster (Task 6 - Optimize)
// =================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopProcess {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub mem_bytes: u64,
    pub disk_read_bytes: u64,
    pub disk_write_bytes: u64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerPlanInfo {
    /// "high" | "balanced" | "power_saver" | "unknown"
    pub plan: String,
    pub guid: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySnapshot {
    pub used_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoostReport {
    pub action: String,
    pub success: bool,
    pub message: String,
    pub freed_bytes: u64,
    pub before: Option<MemorySnapshot>,
    pub after: Option<MemorySnapshot>,
    pub affected_items: Vec<String>,
}

// =================================================================
// Cleaner (Task 6 - UX-14)
// =================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanFile {
    pub path: String,
    pub size_bytes: u64,
    pub safe_to_delete: bool,
    pub skip_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub total_size_bytes: u64,
    pub file_count: u32,
    pub files: Vec<CleanFile>,
    pub requires_admin: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanScanResult {
    pub categories: Vec<CleanCategory>,
    pub total_size_bytes: u64,
    pub total_file_count: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanReport {
    pub success: bool,
    pub deleted_count: u32,
    pub deleted_size_bytes: u64,
    pub failed_count: u32,
    pub failed_paths: Vec<String>,
    pub duration_ms: u64,
    pub log: Vec<String>,
}

// =================================================================
// Repair (Task 6 - UX-16)
// =================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairLogLine {
    pub timestamp_ms: u64,
    /// "stdout" | "stderr" | "system"
    pub stream: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairReport {
    /// "SfcScan" | "DismRestoreHealth" | "DismCheckHealth" | "FlushDns" | "ClearEventLogs"
    pub kind: String,
    pub success: bool,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub message: String,
    pub summary: Option<String>,
}

// =================================================================
// Security / Windows Defender (Task 7 - UX-20..24)
// =================================================================

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum ThreatSeverity {
    Low,
    Moderate,
    High,
    Severe,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Threat {
    pub threat_id: String,
    pub name: String,
    pub path: String,
    pub is_quarantined: bool,
    /// "Low" | "Moderate" | "High" | "Severe" | "Unknown"
    pub severity: ThreatSeverity,
    pub category: String,
    pub detected_at: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum FirewallProfileName {
    Domain,
    Private,
    Public,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum FirewallAction {
    Allow,
    Block,
    NotConfigured,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirewallProfile {
    pub name: FirewallProfileName,
    pub enabled: bool,
    pub inbound_action: FirewallAction,
    pub outbound_action: FirewallAction,
    pub logging_enabled: bool,
}

// =================================================================
// Tools Hub (Task 9 - UX-28)
// =================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAppForUninstall {
    pub name: String,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub install_date: Option<String>,
    pub estimated_size_kb: Option<u64>,
    pub uninstall_string: Option<String>,
    pub registry_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskCleanupReport {
    pub launched: bool,
    pub target_drive: String,
    pub message: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefragReport {
    pub drive: String,
    pub status: String,
    pub message: String,
    pub duration_ms: u64,
    pub is_ssd: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShredReport {
    pub target: String,
    pub success: bool,
    pub passes: u32,
    pub bytes_written: u64,
    pub duration_ms: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryIssue {
    pub hive: String,
    pub key: String,
    pub value: Option<String>,
    pub issue: String,
    /// "info" | "warning" | "error"
    pub severity: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryScanReport {
    pub issues: Vec<RegistryIssue>,
    pub scanned_keys: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub hash: String,
    pub size_bytes: u64,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateScanReport {
    pub groups: Vec<DuplicateGroup>,
    pub wasted_bytes: u64,
    pub scanned_files: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFileEntry {
    pub path: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFileReport {
    pub entries: Vec<LargeFileEntry>,
    pub scanned_files: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePointReport {
    pub success: bool,
    pub sequence_number: Option<u32>,
    pub description: String,
    pub message: String,
    pub duration_ms: u64,
    pub requires_reboot: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerPlan {
    pub guid: String,
    pub name: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPowerPlanReport {
    pub success: bool,
    pub plan_name: String,
    pub previous_guid: Option<String>,
    pub new_guid: String,
    pub message: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkResetStep {
    pub step: String,
    pub success: bool,
    pub output: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkResetReport {
    pub success: bool,
    pub steps: Vec<NetworkResetStep>,
    pub requires_reboot: bool,
    pub message: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryReport {
    pub file_path: String,
    pub generated: bool,
    pub size_bytes: u64,
    pub duration_ms: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub mem_bytes: u64,
    pub disk_read_bytes: u64,
    pub disk_write_bytes: u64,
    pub status: String,
    pub is_system: bool,
    pub cmd: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillProcessReport {
    pub pid: u32,
    pub name: String,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckDiskReport {
    pub drive: String,
    pub success: bool,
    pub needs_reboot: bool,
    pub message: String,
    pub duration_ms: u64,
}

// =================================================================
// Auto-update (Task 11 - Build & Auto-update)
// =================================================================

/// Thông tin bản cập nhật remote tìm được từ updater endpoint.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub latest_version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    pub download_url: Option<String>,
    pub signature_valid: bool,
}

/// Kết quả quá trình tải và cài bản cập nhật.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressReport {
    pub stage: String, // "downloading" | "installing" | "finished" | "failed"
    pub percent: f32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub message: String,
}

// =================================================================
// Thiết lập (Task 14) — 4 nhóm: Định danh / Cá nhân hóa /
// Pin & Nguồn / Kích hoạt
// =================================================================

// -----------------------------------------------------------------
// Định danh
// -----------------------------------------------------------------

/// Giá trị locale của `HKCU\Control Panel\International`.
/// Windows ghép nhiều giá trị hex vào cùng 1 value, ngăn cách bằng `,`
/// theo đúng thứ tự: sShortDate,sLongDate,sShortTime,sLongTime,AM/PM,
/// sDate, sTime, sShortDate(2), ... — chỉ đọc/ghi từng nhóm cần thiết.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LocaleSettings {
    /// Mã locale (vd "en-US"). Ghi vào `LocaleName`.
    pub locale: String,
    /// Định dạng ngày (sShortDate).
    pub short_date: String,
    /// Kiểu giờ 12/24: true = 24 giờ.
    pub time_format_24h: bool,
    /// Định dạng giờ (sShortTime).
    pub short_time: String,
    /// Dấu thập phân (sDecimal).
    pub decimal: String,
    /// Dấu phân cách hàng nghìn (sThousand).
    pub thousand_sep: String,
}

/// Một lựa chọn dạng value/label cho các dropdown (ngày, giờ, số).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectOption {
    pub value: String,
    pub label: String,
}

/// Một múi giờ hỗ trợ.
/// `tzId` = tên mà `tzutil /s` nhận (độc lập ngôn ngữ hệ thống).
/// Đọc từ output của `tzutil /l`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeZoneOption {
    pub tz_id: String,
    /// Chuỗi hiển thị kiểu Control Panel (vd "(UTC+07:00) Bangkok, Hanoi, Jakarta").
    pub display: String,
    pub is_current: bool,
}

/// Một quốc gia/vùng — dùng cho locale + bố cục bàn phím.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountryOption {
    /// Locale dạng "en-VN".
    pub locale: String,
    /// Tên quốc gia.
    pub name: String,
}

/// Giá trị nhóm Định danh.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentitySettings {
    pub computer_name: String,
    pub organization: String,
    pub registered_owner: String,
    pub user_name: String,
    /// Tên tzutil của múi giờ hiện tại (vd "SE Asia Standard Time").
    pub time_zone_tz_id: String,
    /// Chuỗi hiển thị múi giờ hiện tại.
    pub time_zone_display: String,
    pub locale: LocaleSettings,
    /// Các lựa chọn cho date/time/number — frontend render thành dropdown.
    pub date_formats: Vec<SelectOption>,
    pub time_formats: Vec<SelectOption>,
    pub decimal_formats: Vec<SelectOption>,
    pub thousand_formats: Vec<SelectOption>,
    /// Mã vùng bàn phím hiện tại (vd 1156 = Vietnamese).
    pub keyboard_layout_id: u32,
    pub keyboard_layout_label: String,
    /// Danh sách múi giờ đọc từ `tzutil /l`.
    pub time_zones: Vec<TimeZoneOption>,
    pub countries: Vec<CountryOption>,
    /// Danh sách bố cục bàn phím đã cài trên máy.
    pub keyboard_layouts: Vec<KeyboardLayout>,
    /// false nếu không đọc được registry (chạy ngoài Tauri hoặc bị chặn).
    pub is_readable: bool,
}

/// Một bố cục bàn phím đã cài trên máy.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardLayout {
    /// Mã vùng dạng số thập phân (vd 1033 = US, 1066 = Vietnamese).
    pub id: u32,
    /// Tên hiển thị (vd "US", "Vietnamese").
    pub name: String,
    pub is_current: bool,
}

// -----------------------------------------------------------------
// Cá nhân hóa
// -----------------------------------------------------------------

/// Biểu tượng Desktop. Quy ước `true` = đang hiển thị.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopIcons {
    pub this_pc: bool,
    pub network: bool,
    pub recycle_bin: bool,
    pub user_files: bool,
    pub control_panel: bool,
}

/// Một màu trong bảng màu Windows chuẩn.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccentColor {
    /// Mã màu Windows (vd "windows.blue").
    pub id: String,
    pub name: String,
    /// "#RRGGBB" để frontend hiển thị swatch.
    pub hex: String,
    /// Mã ABGR để ghi registry (ColorizationColor).
    pub abgr: u32,
}

/// Giá trị nhóm Cá nhân hóa.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalizationSettings {
    /// "light" | "dark" | "custom"
    pub theme: String,
    pub uses_light_theme: bool,
    pub wallpaper_path: String,
    /// 10 = fill, 6 = fit, 2 = stretch, 22 = span.
    pub wallpaper_style: u32,
    pub desktop_icons: DesktopIcons,
    pub accent_color_id: String,
    pub accent_color_hex: String,
    pub accent_palette: Vec<AccentColor>,
    /// 0 = tắt, 1 = Start + taskbar, 2 = chỉ taskbar.
    pub accent_on_start_taskbar: u32,
    /// Màu nhấn trên thanh tiêu đề & viền cửa sổ (DWM ColorPrevalence).
    pub accent_on_title_bars: bool,
    pub lock_screen_image: String,
    pub is_readable: bool,
}

// -----------------------------------------------------------------
// Pin & Nguồn
// -----------------------------------------------------------------

/// Trạng thái pin — `has_battery=false` khi là máy tính để bàn.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryStatus {
    pub name: String,
    pub has_battery: bool,
    /// "Discharging" | "Charging" | "Full" | "Not present"
    pub status: String,
    pub charge_percent: Option<u32>,
    pub estimated_minutes_remaining: Option<u32>,
    pub design_capacity_mwh: Option<u64>,
    pub full_charge_capacity_mwh: Option<u64>,
}

/// Một power scheme có sẵn trên máy.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerPlanOption {
    pub guid: String,
    /// "balanced" | "high" | "power_saver" | "ultimate" | "unknown"
    pub key: String,
    pub name: String,
    pub is_active: bool,
}

/// Giá trị nhóm Pin & Nguồn. Timeout tính bằng GIÂY, 0 = never.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerSettings {
    pub active_scheme_guid: String,
    pub active_plan: String,
    pub available_plans: Vec<PowerPlanOption>,
    pub monitor_timeout_ac: u32,
    pub monitor_timeout_dc: u32,
    pub sleep_timeout_ac: u32,
    pub sleep_timeout_dc: u32,
    pub hibernate_timeout_ac: u32,
    pub hibernate_timeout_dc: u32,
    pub battery: BatteryStatus,
}

// -----------------------------------------------------------------
// Patch (input từ frontend) — chỉ chứa field được thay đổi.
// `None` = không đụng tới, `Some` = áp dụng giá trị mới.
// -----------------------------------------------------------------

/// Patch cho nhóm Định danh.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IdentityPatch {
    /// Tên máy — tối đa 15 ký tự, không khoảng trắng.
    pub computer_name: Option<String>,
    /// Tổ chức (RegisteredOrganization).
    pub organization: Option<String>,
    /// Tên múi giờ theo `tzutil` (vd "SE Asia Standard Time").
    pub time_zone_tz_id: Option<String>,
    /// Định dạng ngày/giờ/số.
    pub locale: Option<LocalePatch>,
    /// Mã vùng bàn phím (0409 = US, 0422 = Vietnamese).
    pub keyboard_layout_id: Option<u32>,
}

/// Patch định dạng locale — field `None` = không đụng tới.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LocalePatch {
    /// Locale name (vd "en-VN") → `LocaleName`.
    pub locale: Option<String>,
    /// Định dạng ngày → `sShortDate`.
    pub short_date: Option<String>,
    /// Định dạng giờ → `sShortTime`.
    pub short_time: Option<String>,
    /// true = 24 giờ → `iTime`.
    pub time_format_24h: Option<bool>,
    /// Dấu thập phân → `sDecimal`.
    pub decimal: Option<String>,
    /// Dấu phân cách nghìn → `sThousand`.
    pub thousand_sep: Option<String>,
}

/// Patch cho nhóm Cá nhân hóa.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersonalizationPatch {
    /// "light" | "dark" | "custom"
    pub theme: Option<String>,
    /// Đường dẫn ảnh nền desktop.
    pub wallpaper_path: Option<String>,
    /// 10 = fill, 6 = fit, 2 = stretch, 22 = span.
    pub wallpaper_style: Option<u32>,
    /// Đường dẫn ảnh màn hình khóa.
    pub lock_screen_image: Option<String>,
    /// Trạng thái hiển thị từng biểu tượng Desktop.
    pub desktop_icons: Option<DesktopIcons>,
    /// Mã màu nhấn ("windows.blue") hoặc hex ("#RRGGBB").
    pub accent_color_id: Option<String>,
    /// 0 = tắt, 1 = Start + taskbar, 2 = chỉ taskbar.
    pub accent_on_start_taskbar: Option<u32>,
    /// Màu nhấn trên thanh tiêu đề & viền cửa sổ.
    pub accent_on_title_bars: Option<bool>,
}

/// Patch cho nhóm Pin & Nguồn. Timeout tính bằng GIÂY, 0 = never.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PowerPatch {
    /// "balanced" | "high" | "power_saver" | "ultimate"
    pub plan: Option<String>,
    pub monitor_timeout_ac: Option<u32>,
    pub monitor_timeout_dc: Option<u32>,
    pub sleep_timeout_ac: Option<u32>,
    pub sleep_timeout_dc: Option<u32>,
    pub hibernate_timeout_ac: Option<u32>,
    pub hibernate_timeout_dc: Option<u32>,
}

// -----------------------------------------------------------------
// Kích hoạt
// -----------------------------------------------------------------

/// Trạng thái kích hoạt Windows (WMI SoftwareLicensingProduct).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationStatus {
    pub activated: bool,
    pub status_code: u32,
    /// Thông điệp license do Windows trả về.
    pub description: String,
    /// 5 ký tự cuối của product key (PartialProductKey).
    pub partial_product_key: Option<String>,
    pub grace_period_days: Option<u32>,
}

// -----------------------------------------------------------------
// Kết quả áp dụng
// -----------------------------------------------------------------

/// Kết quả 1 lần "Áp dụng" cho nhóm chức năng.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    /// "identity" | "personalization" | "power" | "activation"
    pub group: String,
    pub success: bool,
    pub applied: Vec<String>,
    pub failed: Vec<String>,
    /// Cần đăng xuất/đăng nhập lại để thấy thay đổi (đổi tên máy, múi giờ).
    pub requires_signout: bool,
    /// Cần restart explorer.exe (đổi theme, hình nền, biểu tượng desktop).
    pub requires_explorer_restart: bool,
    pub message: String,
}
