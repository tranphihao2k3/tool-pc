---
name: PC Manager Pro - Plan chi tiết kỹ thuật
overview: Clone đầy đủ 30 màn hình UX/UI thành app Tauri+React+TS. Plan này tập trung vào CÁCH LẤY DỮ LIỆU chính xác cho từng chức năng, cách tránh lỗi phổ biến, fallback khi permission bị từ chối, validation dữ liệu.
todos:
  - id: task1_setup
    content: "Task 1: Setup project Tauri+React+TS + design system (3-4 ngày)"
    status: completed
  - id: task2_onboarding
    content: "Task 2: Onboarding flow - 4 màn hình UX-1→UX-4 (2 ngày)"
    status: completed
  - id: task3_system_backend
    content: "Task 3: System Info Backend - WMI/Registry/shell commands (4 ngày)"
    status: completed
  - id: task4_system_ui
    content: "Task 4: System Info UI - 5 màn hình UX-9→UX-13 (3 ngày)"
    status: completed
  - id: task5_dashboard
    content: "Task 5: Dashboard + Real-time Monitor - UX-5→UX-8 (3 ngày)"
    status: completed
  - id: task6_optimize
    content: "Task 6: Optimize - 6 màn hình UX-14→UX-19 (6 ngày)"
    status: completed
  - id: task7_security
    content: "Task 7: Security - 5 màn hình UX-20→UX-24 wrap Defender (4 ngày)"
    status: completed
  - id: task8_driver
    content: "Task 8: Driver Manager - UX-25→UX-27 WMI+pnputil (3 ngày)"
    status: completed
  - id: task9_tools
    content: "Task 9: Tools Hub - UX-28, 14 mini tools (3 ngày)"
    status: completed
  - id: task10_settings
    content: "Task 10: Settings + i18n - UX-29,UX-30 (2 ngày)"
    status: completed
  - id: task11_build
    content: "Task 11: Build + Auto-update - .msi/.exe + GitHub Releases"
    status: completed
  - id: task12_polish
    content: "Task 12: Polish + A11y - ErrorBoundary, log, a11y"
    status: completed
  - id: task13_dashboard_compact
    content: "Task 13: Dashboard compact + số liệu chuẩn (1 thanh, click xem chi tiết)"
    status: completed
  - id: task14_null_safety
    content: "Task 14: Null-safety hotfix - Driver/Security crash khi data null"
    status: completed
isProject: false
---

# PC Manager Pro — Plan chi tiết kỹ thuật

> **Stack xác nhận**: Tauri 2 + React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui + Zustand + React Router + Recharts
> **Lưu data**: Local-first với `tauri-plugin-store` (file JSON trong AppData)
> **Ngôn ngữ UI**: Tiếng Việt (chính) + EN (phụ)
> **Theme**: Dark mode gradient tím-xanh (clone từ ảnh)

---

## PHẦN 1 — CHI TIẾT KỸ THUẬT TỪNG CHỨC NĂNG

Mỗi chức năng sẽ mô tả: **Mục đích → Nguồn dữ liệu chính xác → Code pattern → Cách tránh lỗi → Fallback**.

---

### 1.1 Thông tin hệ thống (OS)

**Nguồn dữ liệu chính xác** (ưu tiên theo thứ tự):
- **Crate `tauri-plugin-os`** → `os_type()`, `os_version()`, `arch()`, `hostname()`
- **Win API `GetVersionExW`** / `RtlGetVersion` (qua crate `windows`) → build number chính xác (vd: 22631.4391)
- **Registry `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`**:
  - `ProductName` (vd: "Windows 11 Pro")
  - `DisplayVersion` (vd: "23H2")
  - `CurrentBuild`, `UBR`
  - `EditionID`
  - `InstallationType` (Client/Server)
  - `RegisteredOwner`, `RegisteredOrganization`

**Code pattern Rust**:
```rust
#[tauri::command]
async fn get_os_info() -> Result<OsInfo, String> {
    // 1. Lấy từ plugin-os
    let platform = tauri_plugin_os::platform();
    let version = tauri_plugin_os::version(); // "10.0.22631"
    
    // 2. Đọc registry để lấy ProductName & DisplayVersion chính xác
    let hklm = winreg::RegKey::predef(winreg::HKEY_LOCAL_MACHINE);
    let key = hklm.open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")?;
    let product_name: String = key.get_value("ProductName")?;
    let display_version: String = key.get_value("DisplayVersion")?;
    let build: String = key.get_value("CurrentBuild")?;
    let ubr: u32 = key.get_value("UBR")?;
    
    // 3. Detect uptime bằng GetTickCount64
    // 4. Detect activation status qua WMI SoftwareLicensingProduct
    
    Ok(OsInfo { product_name, display_version, build, ubr, ... })
}
```

**Tránh lỗi**:
- KHÔNG dùng `Environment::os_version()` từ std (chỉ trả về "Windows 10/11" generic, không có build)
- LUÔN kèm `UBR` (Update Build Revision) vì `DisplayVersion` không đủ để phân biệt patch
- Nếu registry đọc fail (sandbox) → fallback về `tauri-plugin-os` + `RtlGetVersion` qua FFI

---

### 1.2 Thông tin CPU

**Nguồn dữ liệu chính xác**:
- **WMI `Win32_Processor`** (chính xác nhất):
  - `Name` (vd: "AMD Ryzen 7 5800X 8-Core Processor")
  - `Manufacturer` (GenuineIntel / AuthenticAMD)
  - `NumberOfCores`, `NumberOfLogicalProcessors`
  - `MaxClockSpeed` (MHz)
  - `CurrentClockSpeed`
  - `L2CacheSize`, `L3CacheSize` (KB)
  - `SocketDesignation`
  - `Architecture` (0=x86, 9=x64, 12=ARM64)
  - `CPUStatus`, `Status`
  - `ProcessorId` (CPU ID string)
  - `Voltage`, `CurrentVoltage`
  - `AddressWidth`, `DataWidth`
  - `Family`, `Stepping`, `Model`
  - `LoadPercentage` (real-time %)
- **Registry fallback**: `HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\0` (ít field hơn)

**Code pattern Rust**:
```rust
use wmi::{WMIConnection, COMLibrary};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Win32Processor {
    name: String,
    manufacturer: String,
    number_of_cores: u32,
    number_of_logical_processors: u32,
    max_clock_speed: u32,
    current_clock_speed: u32,
    l2_cache_size: u32,
    l3_cache_size: u32,
    processor_id: String,
    architecture: u16,
    // ...
}

#[tauri::command]
async fn get_cpu_info() -> Result<CpuInfo, String> {
    let com = COMLibrary::new()?;
    let wmi = WMIConnection::new(com)?;
    
    let results: Vec<Win32Processor> = wmi
        .query("SELECT * FROM Win32_Processor")
        .map_err(|e| e.to_string())?;
    
    let cpu = results.into_iter().next()
        .ok_or("Không tìm thấy CPU")?;
    
    Ok(CpuInfo { /* map fields */ })
}
```

**Realtime CPU usage** (cho chart):
- Dùng `sysinfo::System::new()` → `refresh_cpu()` mỗi giây → `system.global_cpu_info().cpu_usage()`
- KHÔNG dùng `Win32_Processor.LoadPercentage` (không realtime, chỉ update khi WMI refresh)

**Tránh lỗi**:
- WMI COM init phải dùng `COMLibrary::new()` (STA apartment cho UI thread)
- WMI query có thể mất 1-3s ở lần đầu → cache trong `tauri::State`
- WMI trên Win ARM64: cần dùng `wmi` v2.x+ hỗ trợ cross-arch
- Fallback: nếu WMI fail → đọc registry + `GetSystemInfo` API

---

### 1.3 Thông tin RAM

**Nguồn dữ liệu chính xác**:
- **WMI `Win32_PhysicalMemory`** (chi tiết từng thanh RAM):
  - `Capacity` (bytes)
  - `Speed` (MHz) - vd: DDR4 3200
  - `Manufacturer` (Kingston, Samsung...)
  - `PartNumber` (model)
  - `SerialNumber`
  - `DeviceLocator` (slot - vd: "DIMM_A1")
  - `FormFactor` (8=DIMM, 12=SODIMM)
  - `MemoryType` (26=DDR4, 34=DDR5, 0=Unknown)
  - `DataWidth`, `TotalWidth` (64/72 bit → có ECC hay không)
  - `ConfiguredClockSpeed`, `ConfiguredVoltage`
- **WMI `Win32_ComputerSystem`**:
  - `TotalPhysicalMemory` (tổng)
- **WMI `Win32_OperatingSystem`**:
  - `FreePhysicalMemory`, `TotalVisibleMemorySize`
- **sysinfo** → cho realtime usage

**Code pattern**:
```rust
#[tauri::command]
async fn get_ram_info() -> Result<RamInfo, String> {
    let com = COMLibrary::new()?;
    let wmi = WMIConnection::new(com)?;
    
    // Từng thanh RAM
    let sticks: Vec<RamStick> = wmi.query(
        "SELECT Capacity, Speed, Manufacturer, PartNumber, DeviceLocator, 
                FormFactor, MemoryType, TotalWidth, ConfiguredClockSpeed 
         FROM Win32_PhysicalMemory"
    )?;
    
    // Real-time usage
    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    let total = sys.total_memory();
    let used = sys.used_memory();
    
    // Số slot
    let slots: Vec<RamSlot> = wmi.query(
        "SELECT MaxCapacity, MemoryDevices FROM Win32_PhysicalMemoryArray"
    )?;
    
    Ok(RamInfo { sticks, total, used, slots })
}
```

**Tránh lỗi**:
- `Win32_PhysicalMemory.MemoryType` có thể trả về 0 (Unknown) trên một số BIOS → fallback đọc từ SPD qua `Get-PhysicalMemory` PowerShell
- ECC detection: `TotalWidth == 72` mới là ECC
- Capacity là BYTES (chia 1024^3 mới ra GB chính xác)

---

### 1.4 Thông tin Mainboard / BIOS

**Nguồn dữ liệu chính xác**:
- **WMI `Win32_BaseBoard`**:
  - `Manufacturer` (ASUS, MSI, Gigabyte...)
  - `Product` (model mainboard)
  - `Version`, `SerialNumber`
- **WMI `Win32_BIOS`**:
  - `Manufacturer` (American Megatrends, Insyde, Phoenix...)
  - `SMBIOSBIOSVersion` (vd: "F16")
  - `ReleaseDate` (format YYYYMMDD000000.000000+000)
  - `BIOSVersion` (array)
  - `SystemBIOSMajorVersion`, `SystemBIOSMinorVersion`
- **WMI `Win32_ComputerSystem**:
  - `Manufacturer` (vd: "Dell Inc.")
  - `Model` (vd: "OptiPlex 7090")
  - `SystemFamily`
  - `SystemType` (x64-based PC)
  - `PCSystemType` (Desktop/Laptop/...)

**Tránh lỗi**:
- `ReleaseDate` từ WMI là `datetime` chuỗi → parse về `DateTime<Utc>`
- `SMBIOSBIOSVersion` có thể chứa nhiều version cách nhau bởi dấu phẩy

---

### 1.5 Thông tin Disk (ổ cứng)

**Nguồn dữ liệu chính xác**:
- **WMI `Win32_DiskDrive`** (từng ổ vật lý):
  - `Model` (Samsung SSD 980 PRO 1TB)
  - `Size` (bytes)
  - `InterfaceType` (NVMe, SATA, SCSI, USB)
  - `MediaType` (Fixed hard disk media, SSD...)
  - `SerialNumber`
  - `FirmwareRevision`
  - `Status`
  - `Partitions` (số partition)
  - `BytesPerSector`
- **WMI `Win32_LogicalDisk`** (volume C:, D:):
  - `DeviceID` (C:, D:)
  - `DriveType` (3=Fixed, 2=Removable, 5=CD-ROM)
  - `FileSystem` (NTFS, FAT32, exFAT, ReFS)
  - `Size`, `FreeSpace`
  - `VolumeName`, `VolumeSerialNumber`
  - `Compressed`
- **sysinfo `Disks`** → realtime usage

**Code pattern**:
```rust
// Tách 2 query: vật lý + logical
let physical: Vec<DiskDrive> = wmi.query("SELECT * FROM Win32_DiskDrive")?;
let logical: Vec<LogicalDisk> = wmi.query("SELECT * FROM Win32_LogicalDisk WHERE DriveType=3")?;
```

**Tránh lỗi**:
- `Win32_DiskDrive.Size` có thể trả 0 cho ổ rỗng hoặc USB chưa mount
- Chia capacity cho 1024^3 (KHÔNG dùng 1000^3) để khớp Windows Explorer
- SSD vs HDD: cần check `MediaType` HOẶC `InterfaceType=NVMe` + đọc SMART qua `Get-PhysicalDisk` PowerShell
- NVMe SMART qua `MSFT_PhysicalDisk` namespace (root\Microsoft\Windows\Storage)

---

### 1.6 Thông tin GPU

**Nguồn dữ liệu chính xác**:
- **WMI `Win32_VideoController`**:
  - `Name` (NVIDIA GeForce RTX 4060)
  - `AdapterCompatibility` (NVIDIA, AMD, Intel)
  - `AdapterRAM` (bytes VRAM - có thể sai trên GPU > 4GB)
  - `DriverVersion` (vd: "31.0.15.3667")
  - `DriverDate` (WMI datetime)
  - `VideoProcessor` (vd: "GA107")
  - `VideoModeDescription` (resolution hiện tại)
  - `CurrentHorizontalResolution`, `CurrentVerticalResolution`
  - `CurrentRefreshRate`
  - `MaxRefreshRate`
  - `Status`
- **WMI `Win32_VideoConfiguration`**:
  - `HorizontalResolution`, `VerticalResolution`
- **Đo nhiệt độ GPU**:
  - NVIDIA: `nvidia-smi --query-gpu=temperature.gpu --format=csv`
  - AMD: `Get-Counter "\GPU Engine(*)\Temperature"`
  - Intel: WMI `Win32_TemperatureProbe` hoặc `OpenHardwareMonitor` nếu user cài
- **VRAM chính xác**: registry `HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000` → `HardwareInformation.qwMemorySize`

**Tránh lỗi**:
- `AdapterRAM` giới hạn 32-bit (max 4GB) → cho GPU > 4GB phải đọc registry
- Nhiều GPU (laptop có Intel + NVIDIA) → list hết, đánh dấu "Discrete" vs "Integrated"
- Nhiệt độ cần tool bên ngoài → chỉ hiển thị nếu có

**Đã hiện thực & kiểm chứng — module `src-tauri/src/gpu.rs`**

Tách GPU thành module riêng dùng chung cho Dashboard (realtime) và System Info
để hai nơi **luôn khớp số liệu**. Backend hợp nhất 4 nguồn:

| Nguồn | Lấy được | Bắt buộc vì |
|-------|----------|--------------|
| `Win32_VideoController` | tên, driver, độ phân giải, refresh rate | nền tảng |
| Registry display class | **VRAM thật** (`qwMemorySize`) | `AdapterRAM` là **UI32** → card 8GB bị bóp méo thành ≈4GB |
| `nvidia-smi` | nhiệt độ, % dùng, VRAM used, driver | chỉ có với NVIDIA |
| WMI `..._GPUEngine` | % dùng (fallback cho AMD/Intel) | card không phải NVIDIA |

**Bẫy đã gặp & cách sửa**

1. `AdapterRAM` là **UI32** → card 8GB trả về `4293918720` (≈4GB). Fix: đọc
   `HardwareInformation.qwMemorySize` (**REG_QWORD**) trong
   `HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\NNNN`.
   Giữ `AdapterRAM` làm fallback cho card không có key registry.
2. Registry lưu `MatchingDeviceId` (vd `pci\ven_10de&dev_1c8c&subsys_118b1025`)
   còn WMI trả `PNPDeviceID` (vd `PCI\VEN_10DE&DEV_1C8C&SUBSYS_118B1025&REV_A1\4&...`)
   → **hai chuỗi khác nhau**, không so khớp trực tiếp được.
   Fix: chuẩn hoá cả hai về `ven_xxxx&dev_xxxx` (`pci_key()`).
3. `winreg 0.52` **không có** API liệt kê subkey (chỉ có `open_subkey`) →
   dò trực tiếp tên số `0000`, `0001`, ... (tối đa 64).
4. `HardwareInformation.MemorySize` là DWORD/biến thể "MB âm" của driver
   (`-1048576`) → **bỏ qua**, chỉ tin `qwMemorySize`.
5. `nvidia-smi` trả `driver_version` (vd "442.23") khác format WMI
   ("26.21.14.4223") → ưu tiên WMI, `nvidia-smi` làm fallback.
6. `Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapter` **không tồn tại**
   (`Invalid class`) → chỉ dùng `..._GPUEngine`.
7. `nvidia-smi` trả nhiều dòng (multi-GPU) → parse **từng dòng**, không chỉ dòng
   đầu như bản cũ.
8. Frontend `SystemOverviewPage` khai báo `useTauriCommand<GpuInfo>` (object)
   trong khi backend trả `Vec<GpuInfo>` (array) → mọi field là `undefined` →
   hiển thị `—`. Fix: đổi sang `GpuInfo[]` + chọn card rời ưu tiên.

**Kết quả kiểm chứng** (máy test: GTX 1050 Ti + Intel HD 630):

```
name        = NVIDIA GeForce GTX 1050 Ti
  vram      = 4294967296 bytes (4.00 GB)   ← đúng 4GB (thay vì bị cắt)
  vram_used = Some(447741952)             ← 427 MB đang dùng
  temp_c    = Some(47.0)
  util_pct  = Some(11.0)
  resolution= 1920x1080 @ 100 Hz
  discrete  = true
```

---

### 1.7 Thông tin Network

**Nguồn dữ liệu chính xác**:
- **WMI `Win32_NetworkAdapter`** (tất cả adapter, kể cả disabled):
  - `Name`, `MACAddress`
  - `Speed` (bits per second - có thể trả -1 nếu unknown)
  - `AdapterType`, `NetConnectionID`
  - `NetEnabled`
- **WMI `Win32_NetworkAdapterConfiguration`** (chỉ adapter enabled + có IP):
  - `IPAddress` (array)
  - `IPSubnet`, `DefaultIPGateway`
  - `DNSServerSearchOrder`
  - `DHCPEnabled`, `DHCPServer`
  - `MACAddress`
  - `IPEnabled`
- **sysinfo `Networks`** → realtime RX/TX KB/s
- **Test ping/latency**: spawn `ping -n 1 8.8.8.8` qua `tauri-plugin-shell`

**Tránh lỗi**:
- Filter `IPEnabled=TRUE` để chỉ lấy adapter thật sự kết nối
- `Win32_NetworkAdapterConfiguration` KHÔNG có trên ARM64 một số trường hợp → fallback `GetAdaptersInfo` API
- IPv6 cần handle array `IPAddress` (có thể chứa cả IPv4 + IPv6)

---

### 1.8 Phần mềm đã cài đặt

**Nguồn dữ liệu chính xác** (4 nguồn, gộp lại):
1. **Registry `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`** → 32-bit apps
2. **Registry `HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`** → 32-bit apps trên Win 64-bit
3. **Registry `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`** → user-scope apps
4. **PowerShell `Get-AppxPackage`** → Microsoft Store / UWP apps (AppX)

**Mỗi entry cần**:
- `DisplayName` (bắt buộc - skip nếu null)
- `DisplayVersion`
- `Publisher`
- `InstallDate` (format YYYYMMDD)
- `EstimatedSize` (KB)
- `InstallLocation`
- `UninstallString`
- `QuietUninstallString`
- `SystemComponent` (filter ra Windows components)
- `ParentKeyName` (filter ra updates)
- `WindowsInstaller` (1 nếu MSI)
- `Architecture` (từ registry path)

**Code pattern Rust**:
```rust
fn enumerate_registry_installs(hive: HKEY, path: &str) -> Result<Vec<AppInfo>> {
    let key = open_subkey(hive, path)?;
    for subkey_name in key.subkeys() {
        let subkey = key.open_subkey(&subkey_name)?;
        let system_component: u32 = subkey.get_value("SystemComponent").unwrap_or(0);
        if system_component == 1 { continue; } // skip Windows components
        
        let display_name: Option<String> = subkey.get_value("DisplayName").ok();
        if display_name.is_none() { continue; } // skip entries without name
        
        let parent_key: Option<String> = subkey.get_value("ParentKeyName").ok();
        if parent_key.is_some() { continue; } // skip updates
        
        apps.push(AppInfo {
            name: display_name.unwrap(),
            version: subkey.get_value("DisplayVersion").ok(),
            publisher: subkey.get_value("Publisher").ok(),
            install_date: parse_date(&subkey.get_value("InstallDate").ok()),
            estimated_size_kb: subkey.get_value("EstimatedSize").ok(),
            uninstall_string: subkey.get_value("UninstallString").ok(),
            quiet_uninstall_string: subkey.get_value("QuietUninstallString").ok(),
            architecture: detect_arch_from_path(&subkey_name),
            source: if is_wow6432 { "Win32" } else { "System" },
        });
    }
    Ok(apps)
}
```

**AppX/Microsoft Store** (spawn PowerShell):
```rust
#[tauri::command]
async fn get_store_apps() -> Result<Vec<AppInfo>, String> {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", 
               "Get-AppxPackage | Select-Object Name, Version, Publisher, InstallLocation, PackageFullName | ConvertTo-Json"])
        .output()?;
    // Parse JSON
}
```

**Tránh lỗi**:
- `InstallDate` là INTEGER (YYYYMMDD), KHÔNG phải string
- `EstimatedSize` là KB
- Filter `SystemComponent=1` để loại Windows update components (~500 entries rác)
- Filter `ParentKeyName` tồn tại để loại hotfix/update
- Một số app ghi vào custom key → dùng `EnumInstalledApps` API hoặc tìm trong `C:\Program Files` (chậm)
- Deduplicate bằng `DisplayName` + `Version`

---

### 1.9 Startup Programs (Ứng dụng khởi động cùng Windows)

**Nguồn dữ liệu chính xác** (5 nguồn):
1. **Registry `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`**
2. **Registry `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`**
3. **Registry `HKCU\...\RunOnce`**
4. **Registry `HKLM\...\RunOnce`**
5. **Task Scheduler** → folder `\Microsoft\Windows` + root
6. **WMI `Win32_StartupCommand`** (deprecated từ Win 8 nhưng vẫn dùng được)
7. **Startup folder** (`shell:startup`, `shell:common startup`)

**Mỗi entry cần**:
- `Name` (tên hiển thị)
- `Path` (đường dẫn exe hoặc command)
- `Location` (Registry/TaskScheduler/StartupFolder)
- `Source` (HKCU/HKLM)
- `Enabled` (bool)
- `Impact` (High/Medium/Low) - đo bằng thời gian load khi khởi động
- `Publisher` (từ file version info)
- `IconPath`

**Tắt startup**:
- Registry: xóa value khỏi key, hoặc rename key thành `Run-disabled`
- TaskScheduler: `Disable-ScheduledTask -TaskName X`

**Tránh lỗi**:
- Đọc `Run` với backup trước khi xóa (export `.reg` file)
- Một số app dùng `RunOnce` để tự xóa sau khi chạy 1 lần → không nên list là "startup"
- TaskScheduler: dùng COM API `ITaskService` hoặc PowerShell wrapper (chậm hơn)
- KHÔNG xóa trực tiếp, chỉ disable (rename key hoặc add `disabled` prefix)

---

### 1.10 Dọn rác (Cleaner)

**Loại file cần quét**:

| Loại | Đường dẫn | Cách xóa an toàn |
|---|---|---|
| Temp user | `%LOCALAPPDATA%\Temp` | Xóa file không bị lock |
| Temp system | `%SystemRoot%\Temp` | Skip file trong use |
| Windows Temp | `C:\Windows\Temp` | Skip file đang dùng |
| Recycle Bin | Mỗi ổ đĩa `$Recycle.Bin` | Dùng `Clear-RecycleBin` PowerShell |
| Browser cache | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache` | Đóng browser trước |
| Thumbnail cache | `%LOCALAPPDATA%\Microsoft\Windows\Explorer` | Safe |
| Memory dump | `%SystemRoot%\*.dmp`, `Minidump\` | Chỉ xóa file > 7 ngày |
| Prefetch | `%SystemRoot%\Prefetch` | Safe, Windows tự dọn |
| Windows Update cache | `C:\Windows\SoftwareDistribution\Download` | Tắt WU service trước |
| DirectX shader cache | `%LOCALAPPDATA%\D3DSCache` | Safe |
| DNS cache | (chỉ flush, không xóa file) | `ipconfig /flushdns` |
| Event logs | `wevtutil cl` | Clear all logs |

**Code pattern Rust**:
```rust
#[derive(Serialize, Deserialize)]
struct CleanCategory {
    id: String,
    name: String,
    paths: Vec<PathBuf>,
    total_size: u64,
    file_count: u32,
    files: Vec<CleanFile>,
    safe_to_delete: bool,
}

#[tauri::command]
async fn scan_temp_files(category: String) -> Result<CleanCategory, String> {
    // 1. Walk directory (parallel với rayon)
    let entries: Vec<DirEntry> = walkdir::WalkDir::new(path)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();
    
    // 2. Check file lock
    for entry in entries {
        if !is_file_locked(&entry.path())? {
            total_size += entry.metadata()?.len();
            files.push(CleanFile { path: ..., size: ... });
        }
    }
    
    // 3. Phát event progress
    app.emit("cleaner-progress", CleanProgress { current, total, found_size })?;
    
    Ok(category)
}
```

**Xóa file an toàn**:
```rust
fn safe_delete(path: &Path) -> Result<()> {
    // 1. Check file không bị lock
    let file = std::fs::OpenOptions::new()
        .read(true)
        .open(path)?;
    drop(file);
    
    // 2. Check không phải system file
    let metadata = std::fs::metadata(path)?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_SYSTEM != 0 {
        return Err("System file - skip");
    }
    
    // 3. Move to Recycle Bin (dùng shell API) HOẶC xóa vĩnh viễn
    #[cfg(windows)]
    {
        use windows::Win32::UI::Shell::*;
        // SHFileOperation với FO_DELETE
    }
    
    Ok(())
}
```

**Tránh lỗi**:
- LUÔN check file lock trước khi xóa (dùng `FSUTIL_QUERY_FILE_USED`)
- Skip file có FILE_ATTRIBUTE_SYSTEM, FILE_ATTRIBUTE_HIDDEN
- Skip file trong `C:\Windows\System32`, `C:\Windows\SysWOW64`
- Recycle Bin: dùng `SHEmptyRecycleBinW` API (an toàn, có thể restore)
- Khi xóa WU cache: TẮT service `wuauserv` trước, BẬT lại sau
- Log mọi thao tác vào file để user review trước khi xóa
- Hiển thị danh sách file TRƯỚC khi xóa, có checkbox chọn từng file

---

### 1.11 Tăng tốc (Services Booster)

**Danh sách service an toàn để tắt** (whitelist):
```
SysMain (Superfetch)         - tắt nếu có SSD
DiagTrack                    - telemetry
WSearch (Windows Search)     - nếu không dùng search
Fax                          - fax service
MapsBroker                   - download maps
lfsvc (Geolocation)          - location service
RetailDemo                   - demo service
WerSvc (Windows Error Reporting) - không cần
WMPNetworkSvc                - WMP network sharing
XblAuthManager / XblGameSave - Xbox nếu không game
```

**Nguồn dữ liệu**:
- **PowerShell `Get-Service`** (chậm, 1-2s) hoặc
- **Win API `EnumServicesStatus`** qua crate `windows-service` (nhanh, ~50ms)

**Code pattern**:
```rust
use windows::Win32::System::Services;

#[tauri::command]
async fn list_services() -> Result<Vec<ServiceInfo>, String> {
    let scm = OpenSCManagerW(None, None, SC_MANAGER_ENUMERATE_SERVICE)?;
    let mut bytes_needed = 0;
    let mut services_returned = 0;
    
    // First call to get buffer size
    EnumServicesStatusW(scm, SERVICE_WIN32, SERVICE_STATE_ALL, 
                        None, 0, &mut bytes_needed, &mut services_returned, None);
    
    // Allocate and call again
    let mut buffer = vec![0u8; bytes_needed as usize];
    EnumServicesStatusW(...)?;
    
    // Parse ENUM_SERVICE_STATUSW
    let services = parse_services(&buffer, services_returned);
    Ok(services)
}

#[tauri::command]
async fn set_service_state(name: String, start_type: u32, action: u32) -> Result<(), String> {
    // start_type: 0=Boot, 1=System, 2=Auto, 3=Manual, 4=Disabled
    // action: 0=Stop, 1=Start
    let scm = OpenSCManagerW(...)?;
    let service = OpenServiceW(scm, &name, SERVICE_CHANGE_CONFIG)?;
    ChangeServiceConfigW(service, start_type, ...);
    if action == 0 { ControlService(service, SERVICE_CONTROL_STOP, ...) }
    Ok(())
}
```

**Tránh lỗi**:
- LUÔN whitelist service trước khi cho phép disable (KHÔNG disable `RpcSs`, `EventLog`, `Winmgmt`...)
- Cảnh báo user trước khi disable SysMain/WSearch (ảnh hưởng UX)
- Backup state trước khi thay đổi (lưu JSON để restore)
- Cần quyền admin mới đổi được `SERVICE_AUTO_START` → check elevation trước

---

### 1.12 Sửa lỗi Windows (SFC / DISM)

**SFC (System File Checker)**:
```powershell
sfc /scannow
```
- Chạy ~5-20 phút
- Cần admin
- Output có thể chia làm 3 phase: "Verifying", "Windows Resource Protection found..."

**DISM (Deployment Image Servicing and Management)**:
```powershell
DISM /Online /Cleanup-Image /RestoreHealth
```
- Chạy ~10-30 phút
- Cần admin + internet (để tải file từ Windows Update)
- Khi lỗi mạng → dùng source local: `/Source:D:\sources\install.wim`

**Code pattern** (chạy bất đồng bộ + stream log):
```rust
use tauri_plugin_shell::ShellExt;

#[tauri::command]
async fn run_sfc(app: AppHandle) -> Result<(), String> {
    let (mut rx, _child) = app.shell()
        .command("sfc")
        .args(["/scannow"])
        .spawn()
        .map_err(|e| e.to_string())?;
    
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                app.emit("repair-log", RepairLog { stream: "stdout", line: String::from_utf8_lossy(&line) })?;
            }
            CommandEvent::Stderr(line) => {
                app.emit("repair-log", RepairLog { stream: "stderr", line: String::from_utf8_lossy(&line) })?;
            }
            CommandEvent::Terminated(payload) => break,
            _ => {}
        }
    }
    Ok(())
}
```

**Tránh lỗi**:
- SFC bị lock nếu WU đang chạy → tắt `wuauserv` + `cryptsvc` + `bits` trước
- SFC output tiếng Việt/Anh tùy Windows language → parse cả 2
- DISM phase "Scan" trước "Restore" → hiển thị rõ phase
- Nếu exit code 0 → success; 1 → "found errors but couldn't fix" (cần DISM); 2 → cancel

---

### 1.13 Quét virus (Windows Defender)

**API sử dụng**:
- **PowerShell `Start-MpScan`** - chạy scan
- **`Get-MpThreat`** - danh sách threats hiện tại
- **`Get-MpThreatDetection`** - lịch sử detections
- **`Add-MpPreference`** / `Remove-MpPreference`** - exemption
- **`Set-MpPreference`** - real-time toggles
- **`Update-MpSignature`** - update definitions

**Code pattern**:
```rust
fn run_defender_scan(scan_type: &str) -> Result<String, String> {
    let cmd = match scan_type {
        "quick" => "Start-MpScan -ScanType QuickScan",
        "full" => "Start-MpScan -ScanType FullScan",
        "custom" => "Start-MpScan -ScanType CustomScan -ScanPath 'C:\\Users'",
        _ => return Err("Invalid scan type"),
    };
    // Spawn PowerShell
    spawn_powershell(cmd)
}

fn get_threats() -> Result<Vec<Threat>, String> {
    let output = run_powershell("Get-MpThreat | ConvertTo-Json -Depth 3")?;
    serde_json::from_str(&output).map_err(|e| e.to_string())
}
```

**Tránh lỗi**:
- Defender PowerShell module chỉ có trên Win 10 1709+ → check version trước
- Scan Full chạy rất lâu → cho chạy background, có thể pause
- Một số AV khác (Avast, Kaspersky) sẽ conflict → cảnh báo
- File EICAR test để test scan: download `https://www.eicar.org/download/eicar.com`

---

### 1.14 Driver Management

**Nguồn dữ liệu**:
- **WMI `Win32_PnPSignedDriver`** (chính xác nhất):
  - `DeviceName`, `DeviceClass`
  - `DriverVersion`, `DriverDate`
  - `DriverProviderName`
  - `InfName`
  - `IsSigned`
  - `Signer` (Microsoft, Intel, NVIDIA...)
  - `HardWareID`
- **WMI `Win32_PnPEntity`** (thiết bị):
  - `Caption`, `Description`
  - `DeviceID`, `PNPDeviceID`
  - `Status` (OK/Error/Disabled)
  - `Problem` (nếu có)
- **Công cụ pnputil**:
  ```cmd
  pnputil /enum-drivers    # list installed driver packages
  pnputil /export-driver * C:\Backup  # backup
  pnputil /add-driver C:\Backup\xxx.inf /install  # restore
  ```

**Update check**:
- So sánh `DriverVersion` với manifest local (JSON ship cùng app)
- Manifest update qua `tauri-plugin-store` từ GitHub Releases

**Code pattern**:
```rust
#[tauri::command]
async fn list_drivers() -> Result<Vec<DriverInfo>, String> {
    let com = COMLibrary::new()?;
    let wmi = WMIConnection::new(com)?;
    
    let drivers: Vec<PnPSignedDriver> = wmi.query(
        "SELECT DeviceName, DeviceClass, DriverVersion, DriverDate, 
                DriverProviderName, InfName, IsSigned, Signer 
         FROM Win32_PnPSignedDriver"
    )?;
    
    let manifest = load_driver_manifest()?; // Load từ app data
    
    drivers.into_iter().map(|d| {
        let latest = manifest.get_latest(&d.device_class, &d.hardware_id);
        DriverInfo {
            device_name: d.device_name,
            current_version: d.driver_version,
            latest_version: latest.map(|m| m.version.clone()),
            status: if latest.is_some() { "Update Available" } else { "Up to date" },
            signed: d.is_signed,
            signer: d.signer,
        }
    }).collect()
}
```

**Tránh lỗi**:
- Cần admin để install driver
- Backup driver dùng `pnputil` chứ không đọc registry (an toàn hơn)
- KHÔNG tự động update driver không rõ nguồn → cảnh báo + show SHA256
- Driver date parse: WMI trả `datetime` string → cần `parse_wmi_datetime`

---

### 1.15 Tiện ích Tools Hub

Mỗi tool là 1 command riêng:

| Tool | Command | Cần admin |
|---|---|---|
| Uninstall App | `uninstall_string` từ registry | Tùy app |
| Disk Cleanup | `cleanmgr /d C` | Không |
| Defragment | `defrag C: /O` (tối ưu SSD) hoặc `/D` (HDD) | Không |
| File Shredder | overwrite + delete (DoD 5220.22-M) | Không |
| Registry Cleaner | scan + backup .reg trước | Không |
| Duplicate Finder | hash MD5/SHA256 folder scan | Không |
| Large File Finder | walkdir + sort by size | Không |
| Restore Point | `Checkpoint-Computer -Description "X"` | Có |
| Power Plan | `powercfg /setactive GUID` | Không |
| Network Reset | `netsh winsock reset` + `netsh int ip reset` | Có |
| Flush DNS | `ipconfig /flushdns` | Không |
| Battery Report | `powercfg /batteryreport /output file.html` | Không |
| Process Manager | `sysinfo::System::processes()` | Không |
| Check Disk | `chkdsk C: /F /R` (cần reboot) | Có |

**Tránh lỗi**:
- File Shredder: ghi đè 3 lần ngẫu nhiên + 1 lần zero → đủ chuẩn DoD cho HDD
- SSD không xóa an toàn được (wear leveling) → cảnh báo
- Restore Point cần System Protection enabled → check trước
- Chkdsk cần reboot nếu ổ đang dùng → hỏi user
- Process Manager: filter system processes (PID < 4 hoặc owner = SYSTEM) riêng

---

### 1.16 Settings + i18n

**Lưu trữ**:
- `tauri-plugin-store` → file JSON trong `%APPDATA%\com.pcmanager.app\settings.json`
- Schema cố định, validate khi đọc

**i18n**:
- `react-i18next` + JSON files
- `vi.json` (mặc định), `en.json`
- Auto-detect Windows language qua `tauri-plugin-os::locale()`

**Cấu trúc JSON**:
```json
{
  "ui": { "theme": "dark", "language": "vi", "fontSize": 14 },
  "startup": { "autoLaunch": true, "minimizeToTray": false, "checkUpdate": true },
  "notification": { "enabled": true, "sound": false },
  "security": { "requireAdmin": true, "pinLock": false }
}
```

---

## PHẦN 2 — CÁCH TRÁNH LỖI CHUNG

### 2.1 Permission & Elevation
- **Luôn check admin trước mỗi command cần**:
  ```rust
  fn is_elevated() -> bool {
      // Open SCM với GENERIC_READ - thành công = admin
      OpenSCManagerW(None, None, SC_MANAGER_CONNECT).is_ok()
  }
  ```
- Nếu chưa admin + cần → hiển thị dialog xin quyền + restart với `runas`
- Capability trong `tauri.conf.json` whitelist command được phép gọi

### 2.2 WMI Robustness
- WMI có thể treo 5-10s ở lần đầu (COM init) → cache connection
- Wrap trong `tokio::task::spawn_blocking` để không block UI
- Timeout 30s, retry 1 lần với backoff
- Nếu WMI fail toàn bộ → fallback về Win API

### 2.3 Data Validation
- Mọi struct frontend có `zod` schema validate trước khi dùng
- Rust `serde` strict mode (không allow unknown fields khi cần)
- Sanitize string trước khi hiển thị (chống XSS khi xuất HTML report)

### 2.4 Error Handling
- Rust: custom error type với `thiserror`, map sang user-friendly message
- Frontend: ErrorBoundary + toast notification
- Mọi lỗi đều log vào file + show user message rõ ràng

### 2.5 Performance
- Walkdir với `rayon` parallel
- Cache WMI results trong `Arc<Mutex<HashMap>>` với TTL 5 phút
- Debounce realtime chart 200ms (không update UI mỗi 1s nếu user đang scroll)
- Virtualize list dài với `react-window` (>100 rows)

### 2.6 Testing
- Unit test cho mỗi Rust command (mock WMI)
- Integration test với máy thật
- Manual test trên Win 10 + Win 11 (cả Home và Pro)
- Test ARM64 (Surface Pro X) nếu có

---

## PHẦN 3 — THỨ TỰ TRIỂN KHAI (12 TASK)

Mỗi task có **test checklist riêng**, làm tuần tự:

### TASK 1 — Setup project (3-4 ngày)
- Khởi tạo Tauri 2 + React + TS
- Setup Tailwind + shadcn + design tokens
- App shell (sidebar + topbar)
- Routing skeleton
- **Test**: `npm run tauri dev` chạy, theme đúng

### TASK 2 — Onboarding (2 ngày)
- 4 màn hình UX-1 → UX-4
- Lưu state onboarding vào store
- Auto-detect admin lần đầu
- **Test**: Lần đầu mở → flow đầy đủ; sau đó vào thẳng Dashboard

### TASK 3 — System Info Backend (4 ngày)
- Implement TẤT CẢ Rust command:
  - `get_os_info`, `get_cpu_info`, `get_ram_info`
  - `get_mainboard_info`, `get_disk_info`, `get_gpu_info`
  - `get_network_info`, `get_installed_software`
  - `get_startup_programs`, `get_drivers`
- **Test mỗi command** riêng với `cargo test` + manual test
- **Debug**:
  - WMI timeout → tăng timeout, log rõ
  - Permission denied → cảnh báo user
  - Data sai format → validate trước khi trả

### TASK 4 — System Info UI (3 ngày)
- 5 màn hình UX-9 → UX-13
- **Test**: Mỗi tab load đúng data, không crash khi thiếu field

### TASK 5 — Dashboard + Monitor (3 ngày)
- 4 màn hình UX-5 → UX-8
- Background task emit stats mỗi 1s
- **Test**: Chart update, không leak memory khi đóng tab

### TASK 6 — Optimize (6 ngày)
- 6 màn hình UX-14 → UX-19
- **Test quan trọng**:
  - Cleaner KHÔNG xóa file system
  - Booster chỉ disable service trong whitelist
  - SFC/DISM chạy đúng, stream log
  - Startup toggle có thể revert

### TASK 7 — Security (4 ngày)
- 5 màn hình UX-20 → UX-24
- **Test**: Download EICAR test → Defender phát hiện

### TASK 8 — Driver (3 ngày)
- 3 màn hình UX-25 → UX-27
- **Test**: Backup folder có .inf files, restore thành công

### TASK 9 — Tools Hub (3 ngày)
- 1 màn hình UX-28, 14 tiện ích
- **Test mỗi tool** riêng, fallback khi admin thiếu

### TASK 10 — Settings + i18n (2 ngày)
- 2 màn hình UX-29, UX-30
- VI/EN translations đầy đủ
- **Test**: Đổi ngôn ngữ → UI update ngay

### TASK 11 — Build + Auto-update (1.5 ngày)
- Tauri bundler → .msi + .exe
- Code signing (self-signed để test)
- Auto-update qua GitHub Releases
- **Test**: Cài từ installer, bump version → update OK

### TASK 12 — Polish + A11y (2 ngày)
- Error boundary, toast, loading state
- Keyboard navigation, ARIA labels
- Log file ở AppData
- **Test**: Stress test (mở 30 phút), accessibility scan

### TASK 13 — Dashboard compact + số liệu chuẩn (1 ngày)

**Mục tiêu**: Gộp 6 thẻ thông số rời thành **1 thanh ngang gọn**, click vào metric
nào thì mở panel chi tiết của metric đó. Đồng thời sửa lại toàn bộ số liệu
realtime cho đúng chuẩn Windows Task Manager.

**Backend — `src-tauri/src/stats.rs` (mới)**

Chia 2 tầng để không poll WMI mỗi giây (WMI perf counter tốn 100-300ms/query):

| Tầng | Chu kỳ | Nguồn | Metrics |
|------|--------|-------|---------|
| Fast | 1s | `sysinfo` | CPU %, CPU MHz, per-core, RAM, Disk %, Network bytes/s |
| Slow | 3s | WMI + `nvidia-smi` | Disk I/O, GPU %, GPU temp, GPU VRAM, CPU temp |

**Bẫy WMI đã gặp & cách sửa**

1. `MSAcpi_ThermalZoneTemperature` **không nằm trong `root\cimv2`** (nó ở
   `root\WMI`) và **cần Administrator** → query từ namespace mặc định luôn
   trả `Invalid class`, query `root\WMI` trả `Access denied`.
   → Dùng `Win32_PerfFormattedData_Counters_ThermalZoneInformation`
   (`root\cimv2`, không cần admin, đơn vị **Kelvin**).
2. `Win32_PerfFormattedData_PerfDisk_PhysicalDisk` chỉ có
   `DiskReadBytesPersec` / `DiskWriteBytesPersec`. Query thừa property
   `...PerSec` không tồn tại → WMI trả lỗi, mất **toàn bộ** rows.
3. `nvidia-smi.exe` thường **KHÔNG nằm trong `PATH`** (chỉ ở
   `C:\Program Files\NVIDIA Corporation\NVSMI\`) → `Command::new("nvidia-smi")`
   luôn fail. Phải dò danh sách đường dẫn cài đặt.
4. GPU % phải tính **max theo process** rồi max theo card (giống Task Manager),
   không cộng tất cả process (sẽ vượt 100%).
5. `sysinfo::Components` (Windows) đọc `MSAcpi_ThermalZoneTemperature` (cùng
   vấn đề namespace), chỉ lấy zone đầu tiên, hardcode label `"Computer"`, và
   `temperature()` có thể trả **NaN** → `serde_json` **không serialize được
   NaN** → hỏng cả event `realtime-stats`.
6. `get_realtime_stats` tạo `StatsCollector` mới mỗi lần gọi → warm-up 300ms +
   chạy WMI dư, và tách state delta → tính sai network bytes/s.
   → Monitor thread publish mẫu mới nhất vào cache; command chỉ đọc.

**Frontend**

- `src/features/dashboard/StatsBar.tsx` (mới) — 1 hàng 6 chip compact
  (icon + label + value + bar + hint). Click chip → mở/toggle panel.
- `src/features/dashboard/StatDetailPanel.tsx` (mới) — modal chi tiết theo
  metric: CPU (per-core grid), RAM (dung lượng), Disk (từng phân vùng),
  Nhiệt độ (ngưỡng cảnh báo), GPU (VRAM/temp), Mạng (adapter).
  Có nút "Mở trang {CPU,RAM,...}" để nhảy sang màn hình chi tiết tương ứng.
- `src/features/dashboard/DashboardPage.tsx` — thay 6 card bằng `StatsBar` +
  mount `StatDetailPanel` khi có metric được chọn.

**Test**
- `cargo test --lib stats` — 7 test: mỗi WMI query phải chạy được, NaN/infinite
  phải bị loại, struct phải serialize được, `MSAcpi_*` phải fail trong
  `root\cimv2` (chống hồi quy).
- Click từng chip → panel mở đúng; Escape đóng; overlay chặn click như modal.

---

### TASK 14 — Thiết lập hệ thống Windows (4 nhóm) (2 ngày)

**Mục tiêu**: Mục "Thiết lập" (`/windows-config`) — cấu hình nhanh Windows sau khi
cài đặt, chia 4 nhóm giống Anhdv Boot Toolkit.

**Backend — `src-tauri/src/commands/windows_config.rs` (mới)**

| Nhóm | Command đọc | Command ghi | Cơ chế |
|------|-------------|-------------|---------|
| Định danh | `get_identity_settings` | `apply_identity_settings` | Registry + `tzutil` + `powercfg` |
| Cá nhân hóa | `get_personalization_settings` | `apply_personalization_settings` | Registry + `SystemParametersInfo` |
| Pin & Nguồn | `get_power_settings` | `apply_power_settings` | `powercfg` + WMI `Win32_Battery` |
| Kích hoạt | `get_activation_status` | — (read-only) | WMI `SoftwareLicensingProduct` |

**Bẫy đã gặp & cách sửa**

1. Windows 11 **không còn** `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\TimeZone\TimeZones`
   → dùng `tzutil /l` (parse output) để liệt kê và `tzutil /s` để đặt múi giờ.
2. `powercfg /list` mỗi dòng có dạng `Power Scheme GUID: <guid> (<name>)` →
   phải cắt sau chữ `"GUID:"`, **không** lấy token đầu tiên (sẽ ra `"Power"`).
3. Registry `iTime`: `"1"` = 24 giờ, `"0"` = 12 giờ (kèm `h:mm tt`) — **không phải** `"24"`.
4. `winreg 0.52` dùng `KEY_SET_VALUE` / `KEY_ALL_ACCESS`, **không có** `HKEY_WRITE`.
5. Registry `sMonth` chứa **tên tháng** (vd "January"), không phải mẫu định dạng →
   bỏ field "Kiểu tháng" khỏi UI thay vì hiển thị dropdown sai.
6. Múi giờ / đổi tên máy cần **đăng nhập lại** → `ApplyResult.requiresSignout`.
7. Đổi accent color phải **restart explorer.exe** → `requiresExplorerRestart`.
8. Mỗi field ghi **độc lập**: field lỗi thì báo riêng field đó, không rollback
   field đã set thành công (đúng hành vi Anhdv Boot Toolkit).

**Frontend — `src/features/windows-config/`**

- `WindowsConfigPage.tsx` — shell 4 tab.
- `IdentityTab.tsx` — tên máy (validate ≤15 ký tự, không khoảng trắng), tổ chức,
  múi giờ, vùng, kiểu ngày/giờ/số, bàn phím, nút "Thiết lập Việt Nam".
- `PersonalizationTab.tsx` — theme Light/Dark, hình nền, biểu tượng Desktop,
  màu nhấn, accent Start/taskbar/titlebar, ảnh màn hình khóa.
- `PowerTab.tsx` — gói nguồn, sleep/display timeout (AC/DC), trạng thái pin.
- `ActivationTab.tsx` — trạng thái license (read-only).
- `components.tsx` + `useConfigCommand.ts` — form primitives + hook gọi Tauri.

**Tích hợp**
- Route `/windows-config` trong `src/app/App.tsx`.
- Menu "Thiết lập" (`SlidersHorizontal`) trong `AppSidebar.tsx` (nhóm "Khác").
- i18n `vi.json` / `en.json`.

---

## PHẦN 4 — CẤU TRÚC PROJECT

```
pc-manager-pro/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── index.html
├── src/                          # React frontend
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   └── providers.tsx
│   ├── features/
│   │   ├── onboarding/           # UX 1-4
│   │   ├── dashboard/            # UX 5-8
│   │   ├── system-info/          # UX 9-13
│   │   ├── optimize/             # UX 14-19
│   │   ├── security/             # UX 20-24
│   │   ├── driver/               # UX 25-27
│   │   ├── tools/                # UX 28
│   │   └── settings/             # UX 29-30
│   ├── shared/
│   │   ├── ui/                   # shadcn components
│   │   ├── components/           # AppShell, Sidebar, Topbar
│   │   ├── hooks/                # useTauriCommand, useSystemMonitor
│   │   ├── lib/                  # utils, formatters
│   │   └── types/                # TS types
│   ├── stores/                   # Zustand
│   ├── locales/                  # vi.json, en.json
│   └── styles/
│       └── globals.css
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/
│   ├── capabilities/
│   │   └── default.json
│   └── src/
│       ├── main.rs
│       ├── state.rs
│       ├── domain/
│       │   ├── mod.rs
│       │   ├── os.rs
│       │   ├── cpu.rs
│       │   ├── ram.rs
│       │   ├── disk.rs
│       │   ├── gpu.rs
│       │   ├── network.rs
│       │   ├── software.rs
│       │   └── driver.rs
│       ├── infra/
│       │   ├── wmi.rs
│       │   ├── registry.rs
│       │   ├── shell.rs
│       │   └── fs.rs
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── system_info.rs
│       │   ├── optimize.rs
│       │   ├── security.rs
│       │   ├── driver.rs
│       │   ├── tools.rs
│       │   └── settings.rs
│       └── monitor/
│           └── realtime.rs       # Background task emit stats
├── public/
└── docs/
    ├── api-commands.md
    ├── design-tokens.md
    └── testing-checklist.md
```

---

## PHẦN 5 — DEPENDENCIES CẦN CÀI

```bash
# Frontend
npm i react-router-dom zustand @tanstack/react-query recharts
npm i lucide-react framer-motion react-i18next i18next
npm i zod react-hook-form @hookform/resolvers
npm i react-window react-use

# Tailwind + shadcn
npm i -D tailwindcss postcss autoprefixer @types/node
npx tailwindcss init -p
npx shadcn@latest init
npx shadcn@latest add button card input label dialog tabs select
npx shadcn@latest add table toast progress switch slider

# Tauri plugins
npm i @tauri-apps/api
npm i @tauri-apps/plugin-store @tauri-apps/plugin-os
npm i @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
npm i @tauri-apps/plugin-shell @tauri-apps/plugin-log
npm i @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-store = "2"
tauri-plugin-os = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-shell = "2"
tauri-plugin-log = "2"
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
anyhow = "1"
thiserror = "1"
sysinfo = "0.31"
wmi = "0.14"
windows = { version = "0.58", features = [
    "Win32_Foundation", "Win32_System_Services",
    "Win32_System_Registry", "Win32_Storage_FileSystem",
    "Win32_NetworkManagement", "Win32_UI_Shell",
    "Win32_System_Com", "Win32_System_Performance"
]}
winreg = "0.52"
walkdir = "2"
rayon = "1"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
log = "0.4"
```

---

## PHẦN 6 — TIÊU CHÍ HOÀN THÀNH

- [ ] 30 màn hình UX/UI clone đúng (theme, layout, copy VI)
- [ ] 8 nhóm chức năng chạy đúng trên Win 10 + Win 11
- [ ] Build ra `.msi` + `.exe` cài được, size < 80MB
- [ ] App ổn định 30 phút không crash
- [ ] Có auto-update channel
- [ ] Có log file debug
- [ ] Tất cả chức năng nguy hiểm có confirm dialog
- [ ] Có whitelist cho service disable, file delete
- [ ] Code có comment tiếng Việt cho business logic

---

## PHẦN 7 — LỆNH BẮT ĐẦU

Sau khi bạn confirm plan, tôi sẽ chạy:
```bash
cd "C:\Users\AD\Documents\New folder"
npx create-tauri-app@latest pc-manager-pro --template react-ts --manager npm
cd pc-manager-pro
# Sau đó cài dependencies theo PHẦN 5
npm run tauri dev  # Test khởi động
```

Sau đó triển khai **TASK 1 → TASK 2 → ... → TASK 12** tuần tự, mỗi task có test/debug trước khi qua task tiếp.

---

## PHẦN 8 — TASK 14: NULL-SAFETY HOTFIX (2026-10-24)

### Triệu chứng

```
Scope: driver
Error: TypeError: Cannot read properties of null (reading 'unsigned')
    at OverviewTab (src/features/driver/DriverPage.tsx:505)
```

Trang Driver crash ngay khi mount. Trang Security có lỗi tương tự
(`DefenderOverview` đọc `.available`, `ScanTab` đọc `.signatureLastUpdated` trên `null`).

### Nguyên nhân gốc

`useTauriCommand<T>` khai báo state là `T | null` và khởi tạo `data = null`:

```ts
const [data, setData] = useState<T | null>(null);
```

Nhưng `DriverPage.tsx` truyền `summary={summary!}` — dấu `!` (non-null assertion)
chỉ lừa TypeScript, **không có tác dụng runtime**. Ở frame render đầu tiên
`summaryQ.data` vẫn là `null` → `summary.unsigned` ném exception.

Lưu ý: đây **không phải** race condition ngẫu nhiên. `loading` khởi tạo là `false`
nên `ErrorState` không kích hoạt, và `data` chỉ được set sau khi promise resolve —
tức là **mọi lần mount trang đều crash** ở frame đầu.

### Cách sửa

**Nguyên tắc**: không bao giờ dùng non-null assertion (`!`) cho dữ liệu bất đồng bộ.
Dùng `null` thật + guard tường minh + trạng thái loading.

#### 1. `DriverPage.tsx` — `OverviewTab` nhận `DriverSummary | null`

```tsx
function OverviewTab({
  summary,
  drivers,
}: {
  /** `null` khi backend chưa trả về — mọi field phải xử lý null-safe. */
  summary: DriverSummary | null;
  drivers: DriverInfo[];
}) {
  // ... classIcons ...

  // Chưa có dữ liệu → hiển thị skeleton thay vì crash khi `summary` là null.
  if (!summary) {
    return <SkeletonOverview />;
  }

  return (/* ... */);
}
```

Call site bỏ assertion:

```tsx
{tab === "overview" && <OverviewTab summary={summary} drivers={drivers} />}
```

#### 2. `SecurityPage.tsx` — guard một lần ở component cha

Vì `status` được dùng ở cả 3 tab, guard tập trung ở `SecurityPage` (thay vì
lặp lại check trong từng tab):

```tsx
if (statusQ.error && !status) {
  return <ErrorState error={statusQ.error} onRetry={statusQ.refetch} title="..." />;
}

// Chưa có dữ liệu (đang tải lần đầu) → hiển thị skeleton.
// Không được dùng `status!` vì `data` là `T | null` → crash khi render lần đầu.
if (!status) {
  return <SkeletonSecurity />;
}

return (
  <div className="space-y-6">
    <DefenderOverview status={status} threatsCount={threats.length} />
    ...
    <ScanTab status={status} onScanComplete={() => threatsQ.refetch()} />
    <SettingsTab status={status} />
  </div>
);
```

#### 3. `StatsBar.tsx` / `StatDetailPanel.tsx` — bỏ `!` trên optional number

TS **không** narrow được property của object qua alias (`const tempAvailable = stats.cpuTempC != null`
không làm `stats.cpuTempC` non-null trong nhánh `if (tempAvailable)`). Phải copy ra
local const **trước** khi so sánh:

```ts
// Local const để TS narrow được (alias của property không narrow).
const cpuTemp = stats.cpuTempC;
const gpuPercent = stats.gpuPercent;

const tempAvailable = cpuTemp != null;
const tempTone: Metric["tone"] =
  cpuTemp == null ? "brand" : cpuTemp >= 90 ? "danger" : cpuTemp >= 75 ? "warning" : "success";
```

Sau đó dùng `cpuTemp.toFixed(0)` / `gpuPercent.toFixed(0)` không cần `!`.

### Kiểm chứng

| Bước | Kết quả |
|---|---|
| `tsc --noEmit` | ✅ 0 error |
| CDP sweep 18 route (`/dashboard` → `/settings`) | ✅ 18/18 OK, không console error |
| CDP poll 50ms trong 1.5s sau navigate | ✅ skeleton được render, **0 exception** |
| Trang `/driver` | ✅ 147 driver, 3 chưa ký, 136 cũ > 2 năm |
| Trang `/security` | ✅ Defender status đọc được, không crash |

### Bài học

- Non-null assertion (`!`) là **lỗi ẩn**, không phải cách xử lý null.
- `useTauriCommand` luôn bắt đầu với `data = null` → mọi component dùng nó
  phải coi dữ liệu là nullable cho tới khi có guard.
- Guard ở component cha (1 chỗ) tốt hơn lặp check trong từng tab.
- Kiểm chứng bằng CDP poll frame-by-frame để bắt được lỗi chỉ xảy ra ở
  frame đầu tiên (loading state) — screenshot tĩnh sẽ bỏ sót.

