//! System Info commands (Task 3).
//!
//! Tổng hợp các command lấy thông tin phần cứng/phần mềm từ Windows.
//! Mỗi command map 1-1 với 1 field trong `shared/types/system.ts`.
//!
//! **Quy tắc chung**:
//! - Mọi command đều trả `AppResult<T>` để frontend nhận lỗi rõ ràng.
//! - WMI/Registry timeout được handle ở từng hàm, fallback về sysinfo
//!   hoặc trả lỗi có message thân thiện.
//! - CPU/RAM realtime dùng `sysinfo` (nhanh, không cần admin).
//! - WMI query dùng raw (HashMap<String, Variant>) để không phụ thuộc
//!   struct cụ thể của crate `wmi` (robust khi upgrade).

use crate::domain::{
    CpuInfo, DiskInfo, DriverInfo, GpuInfo, InstalledApp, LogicalVolume, MainboardInfo,
    NetworkAdapter, OsInfo, PhysicalDisk, RamInfo, RamStick, StartupProgram,
};
use crate::AppResult;
use std::collections::HashMap;
use wmi::{COMLibrary, WMIConnection, WMIError};

/// Tạo WMI connection mới. Mỗi command nên tạo riêng (không cache)
/// để tránh COM apartment issue giữa các thread.
fn wmi_conn() -> Result<WMIConnection, WMIError> {
    let com = COMLibrary::new()?;
    WMIConnection::new(com)
}

/// WMI connection dùng chung cho các module khác (`driver_library`).
///
/// `driver_library` cần query `Win32_PnPSignedDriver` để lấy tên thiết bị
/// gắn với mỗi driver package → dùng helper này thay vì tạo connection riêng.
pub(crate) fn wmi_conn_public() -> Result<WMIConnection, WMIError> {
    wmi_conn()
}

/// Chạy raw WMI query trả về Vec<HashMap>. Tự chuyển variant về String.
fn wmi_raw(
    conn: &WMIConnection,
    query: &str,
) -> Result<Vec<HashMap<String, wmi::Variant>>, String> {
    conn.raw_query(query).map_err(|e| e.to_string())
}

fn vstr(v: Option<&wmi::Variant>) -> String {
    match v {
        Some(wmi::Variant::String(s)) => s.clone(),
        Some(wmi::Variant::UI4(n)) => n.to_string(),
        Some(wmi::Variant::UI8(n)) => n.to_string(),
        Some(wmi::Variant::I4(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn vu32(v: Option<&wmi::Variant>) -> u32 {
    match v {
        Some(wmi::Variant::UI4(n)) => *n,
        Some(wmi::Variant::I4(n)) => *n as u32,
        Some(wmi::Variant::UI8(n)) => *n as u32,
        Some(wmi::Variant::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

fn vu64(v: Option<&wmi::Variant>) -> u64 {
    match v {
        Some(wmi::Variant::UI8(n)) => *n,
        Some(wmi::Variant::UI4(n)) => *n as u64,
        Some(wmi::Variant::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

fn vu16(v: Option<&wmi::Variant>) -> u16 {
    match v {
        Some(wmi::Variant::UI4(n)) => *n as u16,
        Some(wmi::Variant::UI2(n)) => *n,
        Some(wmi::Variant::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

fn vbool(v: Option<&wmi::Variant>) -> bool {
    match v {
        Some(wmi::Variant::Bool(b)) => *b,
        Some(wmi::Variant::UI4(n)) => *n != 0,
        _ => false,
    }
}

fn arch_code_to_str(code: u16) -> String {
    match code {
        0 => "x86".into(),
        9 => "x64".into(),
        12 => "ARM64".into(),
        6 => "IA64".into(),
        _ => format!("Unknown({code})"),
    }
}

fn form_factor_to_str(code: u16) -> String {
    match code {
        8 => "DIMM".into(),
        12 => "SODIMM".into(),
        13 => "RIMM".into(),
        0 => "Unknown".into(),
        _ => format!("Other({code})"),
    }
}

fn memory_type_to_str(code: u16) -> String {
    match code {
        20 => "DDR".into(),
        21 => "DDR2".into(),
        24 => "DDR3".into(),
        26 => "DDR4".into(),
        34 => "DDR5".into(),
        0 => "Unknown".into(),
        _ => format!("Other({code})"),
    }
}

fn drive_type_to_str(code: u32) -> String {
    match code {
        0 => "Unknown".into(),
        1 => "NoRootDirectory".into(),
        2 => "RemovableDisk".into(),
        3 => "LocalDisk".into(),
        4 => "NetworkDrive".into(),
        5 => "CompactDisc".into(),
        6 => "RAMDisk".into(),
        _ => format!("Other({code})"),
    }
}

// =================================================================
// CPU
// =================================================================
pub fn get_cpu_info_inner() -> AppResult<CpuInfo> {
    use sysinfo::System;

    // sysinfo realtime
    let mut sys = System::new_all();
    sys.refresh_cpu_usage();
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_usage();
    let load_percent = sys.global_cpu_usage();
    let per_core_load: Vec<f32> = sys.cpus().iter().map(|c| c.cpu_usage()).collect();
    let sys_freq = sys.cpus().first().map(|c| c.frequency()).unwrap_or(0);

    // WMI tên, cache, socket...
    let conn = wmi_conn().map_err(|e| crate::AppError::Wmi(e.to_string()))?;
    let rows = wmi_raw(
        &conn,
        "SELECT Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, \
         MaxClockSpeed, L2CacheSize, L3CacheSize, ProcessorId, Architecture, \
         SocketDesignation, Family, Stepping FROM Win32_Processor",
    )
    .map_err(crate::AppError::Wmi)?;

    if let Some(row) = rows.into_iter().next() {
        Ok(CpuInfo {
            name: vstr(row.get("Name")),
            manufacturer: vstr(row.get("Manufacturer")),
            cores: vu32(row.get("NumberOfCores")),
            threads: vu32(row.get("NumberOfLogicalProcessors")),
            base_clock_mhz: vu32(row.get("MaxClockSpeed")),
            current_clock_mhz: sys_freq as u32,
            l2_cache_kb: vu32(row.get("L2CacheSize")),
            l3_cache_kb: vu32(row.get("L3CacheSize")),
            socket: vstr(row.get("SocketDesignation")),
            architecture: arch_code_to_str(vu16(row.get("Architecture"))),
            processor_id: vstr(row.get("ProcessorId")),
            family: vu32(row.get("Family")).to_string(),
            stepping: vstr(row.get("Stepping")),
            load_percent,
            per_core_load,
            temperature_c: None,
        })
    } else {
        // Fallback: chỉ sysinfo
        let first = sys.cpus().first();
        Ok(CpuInfo {
            name: first.map(|c| c.brand().to_string()).unwrap_or_default(),
            manufacturer: first.map(|c| c.vendor_id().to_string()).unwrap_or_default(),
            cores: sys.physical_core_count().unwrap_or(0) as u32,
            threads: sys.cpus().len() as u32,
            base_clock_mhz: sys_freq as u32,
            current_clock_mhz: sys_freq as u32,
            l2_cache_kb: 0,
            l3_cache_kb: 0,
            socket: String::new(),
            architecture: std::env::consts::ARCH.to_string(),
            processor_id: String::new(),
            family: String::new(),
            stepping: String::new(),
            load_percent,
            per_core_load,
            temperature_c: None,
        })
    }
}

// =================================================================
// RAM
// =================================================================
pub fn get_ram_info_inner() -> AppResult<RamInfo> {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_memory();
    let total_bytes = sys.total_memory();
    let used_bytes = sys.used_memory();
    let available_bytes = sys.available_memory();
    let swap_total = sys.total_swap();
    let swap_used = sys.used_swap();

    let conn = wmi_conn().map_err(|e| crate::AppError::Wmi(e.to_string()))?;

    let stick_rows = wmi_raw(
        &conn,
        "SELECT Capacity, Speed, Manufacturer, PartNumber, DeviceLocator, \
         FormFactor, MemoryType, DataWidth, TotalWidth, ConfiguredVoltage \
         FROM Win32_PhysicalMemory",
    )
    .map_err(crate::AppError::Wmi)?;

    let mut sticks: Vec<RamStick> = stick_rows
        .into_iter()
        .map(|r| {
            let data_w = vu16(r.get("DataWidth"));
            let total_w = vu16(r.get("TotalWidth"));
            RamStick {
                capacity_bytes: vu64(r.get("Capacity")),
                speed_mhz: vu32(r.get("Speed")),
                manufacturer: vstr(r.get("Manufacturer")),
                part_number: vstr(r.get("PartNumber")),
                device_locator: vstr(r.get("DeviceLocator")),
                form_factor: form_factor_to_str(vu16(r.get("FormFactor"))),
                memory_type: memory_type_to_str(vu16(r.get("MemoryType"))),
                data_width_bits: data_w,
                total_width_bits: total_w,
                is_ecc: total_w > data_w && total_w > 0,
                configured_voltage: vu32(r.get("ConfiguredVoltage")) as f32 / 1000.0,
            }
        })
        .collect();

    let total_slots = wmi_raw(
        &conn,
        "SELECT MemoryDevices FROM Win32_PhysicalMemoryArray",
    )
    .ok()
    .and_then(|rows| rows.into_iter().next())
    .map(|r| vu32(r.get("MemoryDevices")))
    .unwrap_or(0);

    let used_slots = sticks.len() as u32;
    sticks.sort_by(|a, b| a.device_locator.cmp(&b.device_locator));

    Ok(RamInfo {
        sticks,
        total_slots,
        used_slots,
        total_bytes,
        used_bytes,
        available_bytes,
        cached_bytes: 0,
        swap_total_bytes: swap_total,
        swap_used_bytes: swap_used,
    })
}

// =================================================================
// OS
// =================================================================
pub fn get_os_info_inner() -> AppResult<OsInfo> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let nt_key = hklm
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .map_err(|e| crate::AppError::Registry(e.to_string()))?;

    let product_name: String = nt_key
        .get_value("ProductName")
        .unwrap_or_else(|_| "Windows".into());
    let display_version: String = nt_key.get_value("DisplayVersion").unwrap_or_else(|_| "?".into());
    let build: String = nt_key.get_value("CurrentBuild").unwrap_or_else(|_| "0".into());
    let ubr: u32 = nt_key.get_value("UBR").unwrap_or(0);
    let edition: String = nt_key.get_value("EditionID").unwrap_or_default();
    let installation_type: String = nt_key
        .get_value("InstallationType")
        .unwrap_or_else(|_| "Client".into());
    let registered_owner: String = nt_key.get_value("RegisteredOwner").unwrap_or_default();

    let hostname = tauri_plugin_os::hostname();
    let arch = tauri_plugin_os::arch().to_string();
    // tauri-plugin-os không có uptime; dùng GetTickCount64 qua windows crate (TODO)
    // tạm thời trả 0 nếu chưa có
    let uptime_seconds = 0u64;

    // Activation: query WMI SoftwareLicensingProduct (cần admin)
    let activated = (|| -> Option<bool> {
        let conn = wmi_conn().ok()?;
        let rows = wmi_raw(
            &conn,
            "SELECT LicenseStatus FROM SoftwareLicensingProduct \
             WHERE ApplicationID = '55c92734-d682-4d71-983e-d6ec3f16059f' \
             AND PartialProductKey IS NOT NULL",
        )
        .ok()?;
        Some(rows.iter().any(|r| vu32(r.get("LicenseStatus")) == 1))
    })()
    .unwrap_or(false);

    Ok(OsInfo {
        product_name,
        display_version,
        build,
        ubr,
        edition,
        installation_type,
        registered_owner,
        hostname,
        architecture: arch,
        uptime_seconds,
        activated,
    })
}

// =================================================================
// Mainboard
// =================================================================
pub fn get_mainboard_info_inner() -> AppResult<MainboardInfo> {
    let conn = wmi_conn().map_err(|e| crate::AppError::Wmi(e.to_string()))?;

    let board_rows = wmi_raw(
        &conn,
        "SELECT Manufacturer, Product, Version, SerialNumber FROM Win32_BaseBoard",
    )
    .map_err(crate::AppError::Wmi)?;
    let board = board_rows.into_iter().next().unwrap_or_default();

    let bios_rows = wmi_raw(
        &conn,
        "SELECT Manufacturer, SMBIOSBIOSVersion, ReleaseDate FROM Win32_BIOS",
    )
    .map_err(crate::AppError::Wmi)?;
    let bios = bios_rows.into_iter().next().unwrap_or_default();

    let sys_rows = wmi_raw(
        &conn,
        "SELECT Manufacturer, Model, SystemFamily, SystemType FROM Win32_ComputerSystem",
    )
    .map_err(crate::AppError::Wmi)?;
    let sys = sys_rows.into_iter().next().unwrap_or_default();

    Ok(MainboardInfo {
        manufacturer: vstr(board.get("Manufacturer")),
        product: vstr(board.get("Product")),
        version: vstr(board.get("Version")),
        serial_number: vstr(board.get("SerialNumber")),
        bios_vendor: vstr(bios.get("Manufacturer")),
        bios_version: vstr(bios.get("SMBIOSBIOSVersion")),
        bios_release_date: vstr(bios.get("ReleaseDate")),
        system_manufacturer: vstr(sys.get("Manufacturer")),
        system_model: vstr(sys.get("Model")),
        system_family: vstr(sys.get("SystemFamily")),
        system_type: vstr(sys.get("SystemType")),
    })
}

// =================================================================
// Disk
// =================================================================
pub fn get_disk_info_inner() -> AppResult<DiskInfo> {
    let conn = wmi_conn().map_err(|e| crate::AppError::Wmi(e.to_string()))?;

    let physical_rows = wmi_raw(
        &conn,
        "SELECT Model, InterfaceType, MediaType, Size, SerialNumber, \
         FirmwareRevision, Status, Partitions, BytesPerSector \
         FROM Win32_DiskDrive",
    )
    .map_err(crate::AppError::Wmi)?;

    let physical: Vec<PhysicalDisk> = physical_rows
        .into_iter()
        .map(|d| PhysicalDisk {
            model: vstr(d.get("Model")),
            interface_type: vstr(d.get("InterfaceType")),
            media_type: vstr(d.get("MediaType")),
            size_bytes: vu64(d.get("Size")),
            serial_number: vstr(d.get("SerialNumber")).trim().to_string(),
            firmware: vstr(d.get("FirmwareRevision")),
            status: vstr(d.get("Status")),
            partitions: vu32(d.get("Partitions")),
            bytes_per_sector: vu32(d.get("BytesPerSector")),
        })
        .collect();

    let logical_rows = wmi_raw(
        &conn,
        "SELECT DeviceID, VolumeName, FileSystem, Size, FreeSpace, \
         VolumeSerialNumber, DriveType FROM Win32_LogicalDisk WHERE DriveType=3",
    )
    .map_err(crate::AppError::Wmi)?;

    let logical: Vec<LogicalVolume> = logical_rows
        .into_iter()
        .map(|v| LogicalVolume {
            device_id: vstr(v.get("DeviceID")),
            label: vstr(v.get("VolumeName")),
            file_system: vstr(v.get("FileSystem")),
            size_bytes: vu64(v.get("Size")),
            free_bytes: vu64(v.get("FreeSpace")),
            volume_serial: vstr(v.get("VolumeSerialNumber")),
            drive_type: drive_type_to_str(vu32(v.get("DriveType"))),
        })
        .collect();

    Ok(DiskInfo { physical, logical })
}

// =================================================================
// GPU
// =================================================================
pub fn get_gpu_info_inner() -> AppResult<Vec<GpuInfo>> {
    // Dùng module `gpu` chung để hợp nhất WMI + registry (VRAM thật) +
    // nvidia-smi (nhiệt độ, % dùng, VRAM used) — tránh lệch số liệu giữa
    // Dashboard và trang System Info.
    let gpus = crate::gpu::query_all_gpus();
    if gpus.is_empty() {
        return Err(crate::AppError::Wmi(
            "Không đọc được thông tin GPU từ Win32_VideoController".into(),
        ));
    }

    Ok(gpus
        .into_iter()
        .map(|g| GpuInfo {
            name: g.name,
            adapter_compatibility: g.adapter_compatibility,
            vram_bytes: g.vram_bytes,
            vram_used_bytes: g.vram_used_bytes,
            driver_version: g.driver_version,
            driver_date: g.driver_date,
            video_processor: g.video_processor,
            current_resolution: g.current_resolution,
            current_refresh_rate: g.current_refresh_rate,
            max_refresh_rate: g.max_refresh_rate,
            is_discrete: g.is_discrete,
            temperature_c: g.temperature_c,
            utilization_percent: g.utilization_percent,
        })
        .collect())
}

// =================================================================
// Network
// =================================================================
pub fn get_network_info_inner() -> AppResult<Vec<NetworkAdapter>> {
    // sysinfo 0.31 không expose networks() trên Windows.
    // Dùng WMI NetAdapter + Win32_PerfRawData_Tcpip_NetworkInterface để
    // lấy byte counters, hoặc WMI NetAdapterStatistics (Win 10+).
    let conn = wmi_conn().map_err(|e| crate::AppError::Wmi(e.to_string()))?;
    let rows = wmi_raw(
        &conn,
        "SELECT Name, Description, MACAddress, Speed, NetEnabled, AdapterType, \
                BytesReceivedPersec, BytesSentPersec \
         FROM Win32_PerfRawData_Tcpip_NetworkInterface",
    );

    // Build map (name -> rx, tx) từ perf counter (counter cần convert)
    // Để đơn giản: trả rx/tx = 0, FE sẽ tính delta từ polling 2 lần.
    let mut counters: std::collections::HashMap<String, (u64, u64)> =
        std::collections::HashMap::new();
    if let Ok(rows) = rows {
        for r in rows {
            counters.insert(
                vstr(r.get("Name")),
                (
                    vu64(r.get("BytesReceivedPersec")),
                    vu64(r.get("BytesSentPersec")),
                ),
            );
        }
    }

    let rows = wmi_raw(
        &conn,
        "SELECT Name, Description, MACAddress, Speed, NetEnabled, AdapterType \
         FROM Win32_NetworkAdapter WHERE MACAddress IS NOT NULL",
    )
    .map_err(crate::AppError::Wmi)?;

    Ok(rows
        .into_iter()
        .map(|n| {
            let name = vstr(n.get("Name"));
            let (rx, tx) = counters.get(&name).copied().unwrap_or((0, 0));
            NetworkAdapter {
                name: name.clone(),
                description: vstr(n.get("Description")),
                mac_address: vstr(n.get("MACAddress")),
                ipv4: Vec::new(),
                ipv6: Vec::new(),
                subnet: Vec::new(),
                gateway: Vec::new(),
                dns: Vec::new(),
                speed_bps: vu32(n.get("Speed")) as i64,
                interface_type: vstr(n.get("AdapterType")),
                is_connected: vbool(n.get("NetEnabled")),
                rx_bytes: rx,
                tx_bytes: tx,
            }
        })
        .collect())
}

// =================================================================
// Software
// =================================================================
pub fn get_installed_software_inner() -> AppResult<Vec<InstalledApp>> {
    use winreg::enums::*;
    use winreg::RegKey;

    fn collect(
        path: &str,
        source: &str,
        out: &mut Vec<InstalledApp>,
    ) {
        let predef = if source == "RegistryUser" {
            RegKey::predef(HKEY_CURRENT_USER)
        } else {
            RegKey::predef(HKEY_LOCAL_MACHINE)
        };
        let sub = match predef.open_subkey(path) {
            Ok(k) => k,
            Err(_) => return,
        };
        for sub_name in sub.enum_keys().flatten() {
            let sk = match sub.open_subkey(&sub_name) {
                Ok(k) => k,
                Err(_) => continue,
            };
            let name: String = sk.get_value("DisplayName").unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            let sys_component: u32 = sk.get_value("SystemComponent").unwrap_or(0);
            if sys_component == 1 {
                continue;
            }
            let release_type: String = sk.get_value("ReleaseType").unwrap_or_default();
            if release_type == "Security Update" || release_type == "Update Rollup" {
                continue;
            }
            out.push(InstalledApp {
                name,
                version: sk.get_value("DisplayVersion").ok(),
                publisher: sk.get_value("Publisher").ok(),
                install_date: sk.get_value("InstallDate").ok(),
                estimated_size_kb: sk.get_value("EstimatedSize").ok(),
                install_location: sk.get_value("InstallLocation").ok(),
                uninstall_string: sk.get_value("UninstallString").ok(),
                architecture: source.to_string(),
                source: source.to_string(),
            });
        }
    }

    let mut apps: Vec<InstalledApp> = Vec::new();
    collect(
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        "Registry32",
        &mut apps,
    );
    collect(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        "Registry64",
        &mut apps,
    );
    collect(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        "RegistryUser",
        &mut apps,
    );

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name == b.name && a.version == b.version);

    Ok(apps)
}

// =================================================================
// Startup
// =================================================================
pub fn get_startup_programs_inner() -> AppResult<Vec<StartupProgram>> {
    use winreg::enums::*;
    use winreg::RegKey;

    fn collect_run(
        path: &str,
        location: &str,
        scope: &str,
        hkey: winreg::HKEY,
        out: &mut Vec<StartupProgram>,
    ) {
        let predef = RegKey::predef(hkey);
        let key = match predef.open_subkey(path) {
            Ok(k) => k,
            Err(_) => return,
        };
        for (name, _rv) in key.enum_values().flatten() {
            let cmd = match key.get_raw_value(&name) {
                Ok(rv) => match rv.vtype {
                    winreg::enums::RegType::REG_SZ | winreg::enums::RegType::REG_EXPAND_SZ => {
                        String::from_utf8_lossy(&rv.bytes)
                            .trim_end_matches('\0')
                            .to_string()
                    }
                    _ => continue,
                },
                Err(_) => continue,
            };
            out.push(StartupProgram {
                name,
                command: cmd,
                location: location.to_string(),
                scope: scope.to_string(),
                enabled: true,
                publisher: None,
                impact: "Unknown".into(),
            });
        }
    }

    let mut out: Vec<StartupProgram> = Vec::new();
    collect_run(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
        "RegistryRun",
        "HKLM",
        HKEY_LOCAL_MACHINE,
        &mut out,
    );
    collect_run(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
        "RegistryRunOnce",
        "HKLM",
        HKEY_LOCAL_MACHINE,
        &mut out,
    );
    collect_run(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
        "RegistryRun",
        "HKCU",
        HKEY_CURRENT_USER,
        &mut out,
    );
    collect_run(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
        "RegistryRunOnce",
        "HKCU",
        HKEY_CURRENT_USER,
        &mut out,
    );

    Ok(out)
}

// =================================================================
// Driver
// =================================================================
pub fn get_drivers_inner() -> AppResult<Vec<DriverInfo>> {
    let conn = wmi_conn().map_err(|e| crate::AppError::Wmi(e.to_string()))?;
    let rows = wmi_raw(
        &conn,
        "SELECT DeviceName, DeviceClass, DriverVersion, DriverDate, \
         DriverProviderName, InfName, IsSigned, Signer, HardwareID \
         FROM Win32_PnPSignedDriver",
    )
    .map_err(crate::AppError::Wmi)?;

    Ok(rows
        .into_iter()
        .map(|d| DriverInfo {
            device_name: vstr(d.get("DeviceName")),
            device_class: vstr(d.get("DeviceClass")),
            current_version: vstr(d.get("DriverVersion")),
            driver_date: vstr(d.get("DriverDate")),
            provider: vstr(d.get("DriverProviderName")),
            inf_name: vstr(d.get("InfName")),
            is_signed: vbool(d.get("IsSigned")),
            signer: vstr(d.get("Signer")),
            hardware_id: vstr(d.get("HardwareID")),
            latest_version: None,
            update_available: false,
        })
        .collect())
}

// =================================================================
// Tauri commands
// =================================================================

#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}

#[tauri::command]
pub async fn get_os_info() -> AppResult<OsInfo> {
    tauri::async_runtime::spawn_blocking(get_os_info_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_cpu_info() -> AppResult<CpuInfo> {
    tauri::async_runtime::spawn_blocking(get_cpu_info_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_ram_info() -> AppResult<RamInfo> {
    tauri::async_runtime::spawn_blocking(get_ram_info_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_mainboard_info() -> AppResult<MainboardInfo> {
    tauri::async_runtime::spawn_blocking(get_mainboard_info_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_disk_info() -> AppResult<DiskInfo> {
    tauri::async_runtime::spawn_blocking(get_disk_info_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_gpu_info() -> AppResult<Vec<GpuInfo>> {
    tauri::async_runtime::spawn_blocking(get_gpu_info_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_network_info() -> AppResult<Vec<NetworkAdapter>> {
    tauri::async_runtime::spawn_blocking(get_network_info_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_installed_software() -> AppResult<Vec<InstalledApp>> {
    tauri::async_runtime::spawn_blocking(get_installed_software_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_startup_programs() -> AppResult<Vec<StartupProgram>> {
    tauri::async_runtime::spawn_blocking(get_startup_programs_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn get_drivers() -> AppResult<Vec<DriverInfo>> {
    tauri::async_runtime::spawn_blocking(get_drivers_inner)
        .await
        .map_err(|e| crate::AppError::Other(e.to_string()))?
}
