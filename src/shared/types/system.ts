/**
 * Domain types — dùng chung giữa Rust backend & React frontend.
 * Rust struct #[derive(Serialize)] sẽ serialize theo camelCase nhờ serde rename.
 */

export interface OsInfo {
  productName: string;
  displayVersion: string;
  build: string;
  ubr: number;
  edition: string;
  installationType: string;
  registeredOwner: string;
  hostname: string;
  architecture: string;
  uptimeSeconds: number;
  activated: boolean;
}

export interface CpuCore {
  name: string;
  manufacturer: string;
  cores: number;
  threads: number;
  baseClockMhz: number;
  currentClockMhz: number;
  l2CacheKb: number;
  l3CacheKb: number;
  socket: string;
  architecture: string;
  processorId: string;
  family: string;
  stepping: string;
  /** Realtime 0-100, cập nhật mỗi giây. */
  loadPercent: number;
  perCoreLoad?: number[];
  temperatureC?: number | null;
}

export interface RamStick {
  capacityBytes: number;
  speedMhz: number;
  manufacturer: string;
  partNumber: string;
  deviceLocator: string;
  formFactor: string;
  memoryType: string;
  dataWidthBits: number;
  totalWidthBits: number;
  isEcc: boolean;
  configuredVoltage: number;
}

export interface RamInfo {
  sticks: RamStick[];
  totalSlots: number;
  usedSlots: number;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  cachedBytes: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
}

export interface MainboardInfo {
  manufacturer: string;
  product: string;
  version: string;
  serialNumber: string;
  biosVendor: string;
  biosVersion: string;
  biosReleaseDate: string;
  systemManufacturer: string;
  systemModel: string;
  systemFamily: string;
  systemType: string;
}

export interface PhysicalDisk {
  model: string;
  interfaceType: string;
  mediaType: string;
  sizeBytes: number;
  serialNumber: string;
  firmware: string;
  status: string;
  partitions: number;
  bytesPerSector: number;
}

export interface LogicalVolume {
  deviceId: string;
  label: string;
  fileSystem: string;
  sizeBytes: number;
  freeBytes: number;
  volumeSerial: string;
  driveType: string;
}

export interface DiskInfo {
  physical: PhysicalDisk[];
  logical: LogicalVolume[];
}

export interface GpuInfo {
  name: string;
  adapterCompatibility: string;
  /** VRAM tổng (bytes) — lấy từ registry `qwMemorySize` nên chính xác >4GB. */
  vramBytes: number;
  /** VRAM đang dùng (bytes) — chỉ có với card NVIDIA. */
  vramUsedBytes?: number | null;
  driverVersion: string;
  driverDate: string;
  videoProcessor: string;
  currentResolution: string;
  currentRefreshRate: number;
  maxRefreshRate: number;
  isDiscrete: boolean;
  temperatureC?: number | null;
  utilizationPercent?: number | null;
}

export interface NetworkAdapter {
  name: string;
  description: string;
  macAddress: string;
  ipv4: string[];
  ipv6: string[];
  subnet: string[];
  gateway: string[];
  dns: string[];
  speedBps: number; // -1 nếu unknown
  interfaceType: string;
  isConnected: boolean;
  /** Realtime bytes sent/recv tổng. */
  rxBytes: number;
  txBytes: number;
}

export interface InstalledApp {
  name: string;
  version: string | null;
  publisher: string | null;
  installDate: string | null;
  estimatedSizeKb: number | null;
  installLocation: string | null;
  uninstallString: string | null;
  architecture: string;
  source: "Registry32" | "Registry64" | "RegistryUser" | "AppX";
}

export interface StartupProgram {
  name: string;
  command: string;
  location: "RegistryRun" | "RegistryRunOnce" | "TaskScheduler" | "StartupFolder";
  scope: "HKLM" | "HKCU";
  enabled: boolean;
  publisher: string | null;
  impact: "High" | "Medium" | "Low" | "Unknown";
}

export interface DriverInfo {
  deviceName: string;
  deviceClass: string;
  currentVersion: string;
  driverDate: string;
  provider: string;
  infName: string;
  isSigned: boolean;
  signer: string;
  hardwareId: string;
  latestVersion?: string | null;
  updateAvailable: boolean;
}

/** Thống kê driver theo DeviceClass (UX-25). */
export interface DriverClassStat {
  name: string;
  count: number;
}

/** Tổng quan drivers (UX-25). */
export interface DriverSummary {
  total: number;
  unsigned: number;
  withUpdates: number;
  /** Số driver có driver_date cũ hơn 2 năm. */
  oldDrivers: number;
  classes: DriverClassStat[];
}

/** Báo cáo backup driver (UX-27). */
export interface DriverBackupReport {
  targetDir: string;
  exportedCount: number;
  totalSizeBytes: number;
  durationMs: number;
}

/** Hồ sơ nhận diện máy: hãng + dòng sản phẩm. */
export interface MachineProfile {
  /** Nhà sản xuất gốc (vd "Acer"). */
  manufacturer: string;
  /** Model chính xác (vd "Nitro AN515-51"). */
  model: string;
  /** Họ sản phẩm do OEM khai báo (vd "Acer Nitro 5"). */
  family: string;
  /** SKU / mã máy (vd "AN515-51"). */
  sku: string;
  /** Hãng chuẩn hoá (vd "ACER"). */
  brand: string;
  /** Dòng sản phẩm chuẩn hoá (vd "Nitro 5"). */
  series: string;
  /** Slug của hãng (vd "acer"). */
  brandKey: string;
  /** Slug của dòng (vd "nitro-5"). */
  seriesKey: string;
}

/** 1 nhóm driver trong thư viện (vd `ACER/Nitro 5`). */
export interface LibraryGroupStat {
  /** Đường dẫn tương đối (vd "ACER/Nitro 5"). */
  path: string;
  /** Số driver package trong nhóm. */
  driverCount: number;
  /** Tổng dung lượng. */
  sizeBytes: number;
  /** Nhóm này là của dòng máy hiện tại hay không. */
  matchesCurrent: boolean;
}

/** Báo cáo backup có phân loại theo hãng/dòng. */
export interface LibraryBackupReport {
  libraryDir: string;
  /** Subdir của dòng máy hiện tại (vd "ACER/Nitro 5"). */
  currentSubdir: string;
  exportedCount: number;
  failedCount: number;
  totalSizeBytes: number;
  totalFileCount: number;
  durationMs: number;
  groups: LibraryGroupStat[];
  failures: string[];
}

/** Kết quả khôi phục driver từ thư viện. */
export interface DriverRestoreReport {
  addedCount: number;
  alreadyPresentCount: number;
  output: string;
}

/** Realtime stats phát qua event mỗi 1s. */
export interface RealtimeStats {
  cpuPercent: number;
  ramPercent: number;
  ramUsedBytes: number;
  /** Tổng RAM hệ thống (bytes). */
  ramTotalBytes: number;
  gpuPercent: number | null;
  netRxBps: number;
  netTxBps: number;
  diskReadBps: number;
  diskWriteBps: number;
  cpuTempC: number | null;
  timestampMs: number;
  // --- Task 13: số liệu chuẩn cho dashboard ---
  /** % đã dùng của ổ hệ thống (C:). */
  diskPercent: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  /** Ký hiệu ổ hệ thống, vd "C:". */
  diskSystemDrive: string;
  /** Xung nhịp CPU hiện tại (MHz). */
  cpuFreqMhz: number;
  /** Tải % từng core. */
  perCoreLoad: number[];
  gpuName: string | null;
  gpuTempC: number | null;
  gpuVramUsedBytes: number | null;
  gpuVramTotalBytes: number | null;
}

// =================================================================
// Booster (Task 6 - Optimize)
// =================================================================

export interface TopProcess {
  pid: number;
  name: string;
  cpuPercent: number;
  memBytes: number;
  diskReadBytes: number;
  diskWriteBytes: number;
  status: string;
}

export interface PowerPlanInfo {
  plan: "high" | "balanced" | "power_saver" | "unknown";
  guid: string;
  active: boolean;
}

export interface MemorySnapshot {
  usedBytes: number;
  totalBytes: number;
}

export interface BoostReport {
  action: string;
  success: boolean;
  message: string;
  freedBytes: number;
  before: MemorySnapshot | null;
  after: MemorySnapshot | null;
  affectedItems: string[];
}

// =================================================================
// Cleaner (Task 6 - UX-14)
// =================================================================

/** Một file/folder được phát hiện khi quét. */
export interface CleanFile {
  path: string;
  sizeBytes: number;
  /** Có thể xóa an toàn không (không bị lock, không phải system file). */
  safeToDelete: boolean;
  /** Lý do không xóa được (nếu safeToDelete = false). */
  skipReason?: string;
}

/** Một nhóm dọn dẹp (Temp, Recycle Bin, Cache...). */
export interface CleanCategory {
  id: string;
  name: string;
  description: string;
  totalSizeBytes: number;
  fileCount: number;
  files: CleanFile[];
  /** Cảnh báo: true = cần admin / cần tắt service trước. */
  requiresAdmin: boolean;
}

/** Kết quả scan toàn bộ các category được chọn. */
export interface CleanScanResult {
  categories: CleanCategory[];
  totalSizeBytes: number;
  totalFileCount: number;
  durationMs: number;
}

/** Kết quả thực thi xóa. */
export interface CleanReport {
  success: boolean;
  deletedCount: number;
  deletedSizeBytes: number;
  failedCount: number;
  failedPaths: string[];
  durationMs: number;
  /** Log các bước để audit. */
  log: string[];
}

// =================================================================
// Repair (Task 6 - UX-16)
// =================================================================

/** Loại repair. */
export type RepairKind = "SfcScan" | "DismRestoreHealth" | "DismCheckHealth" | "FlushDns" | "ClearEventLogs";

/** Một dòng log streaming từ process SFC/DISM. */
export interface RepairLogLine {
  timestampMs: number;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

/** Báo cáo cuối cùng sau khi chạy. */
export interface RepairReport {
  kind: RepairKind;
  success: boolean;
  exitCode: number | null;
  durationMs: number;
  message: string;
  /** Tóm tắt ngắn (nếu parse được) - ví dụ "Windows Resource Protection did not find any integrity violations." */
  summary: string | null;
}

// =================================================================
// Security / Windows Defender (Task 7 - UX-20..24)
// =================================================================

/** Trạng thái tổng quan Windows Defender. */
export interface DefenderStatus {
  available: boolean;
  /** Service đang chạy (WinDefend). */
  serviceRunning: boolean;
  /** AntivirusEnabled - true nếu Defender đang là AV chính. */
  antivirusEnabled: boolean;
  /** RealtimeProtectionEnabled. */
  realtimeEnabled: boolean;
  /** BehaviorMonitoringEnabled. */
  behaviorMonitoringEnabled: boolean;
  /** CloudProtection level: 0=Disabled, 1=Basic, 2=Advanced, 4=Membership, 6=High+. */
  cloudProtectionLevel: number;
  /** Signature last updated. */
  signatureLastUpdated: string | null;
  /** Signature version. */
  signatureVersion: string;
  /** App version (vd "4.18.24090.9"). */
  appVersion: string;
  /** Engine version. */
  engineVersion: string;
  /** Quick scan age (hours since last). */
  quickScanAgeHours: number | null;
  /** Full scan age. */
  fullScanAgeHours: number | null;
  /** Threat count hiện tại (active). */
  threatCount: number;
}

export type ScanType = "quick" | "full" | "custom";

/** Scan job (UX-20). */
export interface ScanJob {
  id: string;
  scanType: ScanType;
  /** Custom path nếu scanType = custom. */
  scanPath: string | null;
  startedAtMs: number;
  finishedAtMs: number | null;
  status: "running" | "completed" | "failed" | "cancelled";
  threatsFound: number;
  filesScanned: number;
  message: string;
}

/** Một threat detection (UX-21). */
export interface Threat {
  threatId: string;
  name: string;
  /** Path file bị nhiễm. */
  path: string;
  /** Có đang trong quarantine không. */
  isQuarantined: boolean;
  /** Severity: Low / Moderate / High / Severe. */
  severity: "Low" | "Moderate" | "High" | "Severe" | "Unknown";
  category: string;
  detectedAt: string;
  action: string;
}

/** Exclusion entry (UX-23). */
export interface Exclusion {
  id: string;
  /** "Path" | "Process" | "FileType" | "IpAddress". */
  type: "Path" | "Process" | "FileType" | "IpAddress";
  value: string;
  scope: "User" | "System";
}

/** Firewall profile status (UX-24). */
export interface FirewallProfile {
  name: "Domain" | "Private" | "Public";
  enabled: boolean;
  inboundAction: "Allow" | "Block" | "NotConfigured";
  outboundAction: "Allow" | "Block" | "NotConfigured";
  loggingEnabled: boolean;
}

/** Defender preference key-value (cho tab Settings). */
export type DefenderPreferenceKey =
  | "RealtimeProtection"
  | "BehaviorMonitoring"
  | "CloudProtection"
  | "CloudBlockLevel"
  | "CloudExtendedTimeout"
  | "SubmitSamplesConsent"
  | "PUAProtection"
  | "ArchiveMaxDepth"
  | "EmailContentMaxSize"
  | "DisableAntiSpyware"
  | "DisableRealtimeMonitoring"
  | "DisableBehaviorMonitoring"
  | "DisableScriptScanning"
  | "DisableArchiveScanning";

export interface DefenderPreference {
  key: DefenderPreferenceKey;
  value: string;
  description: string;
}

// =================================================================
// Tools Hub (Task 9 - UX-28)
// =================================================================

/** 14 mini tool IDs. */
export type ToolId =
  | "uninstall_app"
  | "disk_cleanup"
  | "defrag"
  | "shred_file"
  | "registry_clean"
  | "duplicate_finder"
  | "large_file_finder"
  | "restore_point"
  | "power_plan"
  | "network_reset"
  | "flush_dns"
  | "battery_report"
  | "process_manager"
  | "check_disk";

/** Metadata cho mỗi tool. */
export interface ToolMeta {
  id: ToolId;
  name: string;
  description: string;
  icon: string;
  /** Tool có cần quyền admin không. */
  requiresAdmin: boolean;
  /** Cảnh báo nguy hiểm (vd: shredder). */
  dangerous?: boolean;
}

/** Ứng dụng đã cài (cho Uninstall). */
export interface InstalledAppForUninstall {
  name: string;
  publisher: string | null;
  version: string | null;
  installDate: string | null;
  estimatedSizeKb: number | null;
  uninstallString: string | null;
  registryKey: string;
}

/** Báo cáo dọn rác ổ đĩa (cleanmgr). */
export interface DiskCleanupReport {
  launched: boolean;
  targetDrive: string;
  message: string;
  durationMs: number;
}

/** Báo cáo defrag. */
export interface DefragReport {
  drive: string;
  /** "ok" | "skipped" | "error" */
  status: string;
  message: string;
  durationMs: number;
  /** true nếu ổ là SSD → sẽ skip optimize. */
  isSsd: boolean;
}

/** Kết quả shred file (DoD 5220.22-M 3-pass). */
export interface ShredReport {
  target: string;
  success: boolean;
  passes: number;
  bytesWritten: number;
  durationMs: number;
  message: string;
}

/** Kết quả quét registry. */
export interface RegistryIssue {
  hive: string;
  key: string;
  value: string | null;
  issue: string;
  severity: "info" | "warning" | "error";
}

export interface RegistryScanReport {
  issues: RegistryIssue[];
  scannedKeys: number;
  durationMs: number;
}

/** File trùng lặp. */
export interface DuplicateGroup {
  hash: string;
  sizeBytes: number;
  paths: string[];
}

export interface DuplicateScanReport {
  groups: DuplicateGroup[];
  wastedBytes: number;
  scannedFiles: number;
  durationMs: number;
}

/** File lớn. */
export interface LargeFileEntry {
  path: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface LargeFileReport {
  entries: LargeFileEntry[];
  scannedFiles: number;
  durationMs: number;
}

/** Restore point. */
export interface RestorePointReport {
  success: boolean;
  sequenceNumber: number | null;
  description: string;
  message: string;
  durationMs: number;
  requiresReboot: boolean;
}

/** Power plan. */
export interface PowerPlan {
  guid: string;
  name: string;
  isActive: boolean;
}

export interface SetPowerPlanReport {
  success: boolean;
  planName: string;
  previousGuid: string | null;
  newGuid: string;
  message: string;
  durationMs: number;
}

/** Network reset. */
export interface NetworkResetReport {
  success: boolean;
  steps: { step: string; success: boolean; output: string }[];
  requiresReboot: boolean;
  message: string;
  durationMs: number;
}

/** Battery report. */
export interface BatteryReport {
  filePath: string;
  generated: boolean;
  sizeBytes: number;
  durationMs: number;
  message: string;
}

/** Process list (Tools process manager). */
export interface ToolProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memBytes: number;
  diskReadBytes: number;
  diskWriteBytes: number;
  status: string;
  isSystem: boolean;
  cmd: string;
}

export interface KillProcessReport {
  pid: number;
  name: string;
  success: boolean;
  message: string;
}

/** Check disk. */
export interface CheckDiskReport {
  drive: string;
  success: boolean;
  needsReboot: boolean;
  message: string;
  durationMs: number;
}

// =================================================================
// Thiết lập (Task 14) — Định danh / Cá nhân hóa / Pin & Nguồn / Kích hoạt
// =================================================================

/** Locale của Windows đọc từ `HKCU\Control Panel\International`. */
export interface LocaleSettings {
  locale: string;
  shortDate: string;
  timeFormat24h: boolean;
  shortTime: string;
  decimal: string;
  thousandSep: string;
}

/** Một múi giờ. `tzId` là tên mà `tzutil /s` nhận. */
export interface TimeZoneOption {
  tzId: string;
  display: string;
  isCurrent: boolean;
}

/** Quốc gia/vùng — locale của vùng đó. */
export interface CountryOption {
  locale: string;
  name: string;
}

/** Bố cục bàn phím đã cài — `id` là mã vùng (1066 = Vietnamese). */
export interface KeyboardLayout {
  id: number;
  name: string;
  isCurrent: boolean;
}

/** Một lựa chọn cho dropdown — backend trả về `{ value, label }`. */
export interface SelectOption {
  value: string;
  label: string;
}

/** Nhóm Định danh. */
export interface IdentitySettings {
  computerName: string;
  organization: string;
  registeredOwner: string;
  userName: string;
  timeZoneTzId: string;
  timeZoneDisplay: string;
  locale: LocaleSettings;
  dateFormats: SelectOption[];
  timeFormats: SelectOption[];
  decimalFormats: SelectOption[];
  thousandFormats: SelectOption[];
  keyboardLayoutId: number;
  keyboardLayoutLabel: string;
  timeZones: TimeZoneOption[];
  countries: CountryOption[];
  keyboardLayouts: KeyboardLayout[];
  isReadable: boolean;
}

/** Biểu tượng Desktop — `true` = đang hiển thị. */
export interface DesktopIcons {
  thisPc: boolean;
  network: boolean;
  recycleBin: boolean;
  userFiles: boolean;
  controlPanel: boolean;
}

/** Một màu trong bảng màu nhấn chuẩn của Windows. */
export interface AccentColor {
  id: string;
  name: string;
  hex: string;
  abgr: number;
}

/** Nhóm Cá nhân hóa. */
export interface PersonalizationSettings {
  theme: "light" | "dark" | "custom";
  usesLightTheme: boolean;
  wallpaperPath: string;
  wallpaperStyle: number;
  desktopIcons: DesktopIcons;
  accentColorId: string;
  accentColorHex: string;
  accentPalette: AccentColor[];
  /** 0 = tắt, 1 = Start + taskbar, 2 = chỉ taskbar. */
  accentOnStartTaskbar: number;
  accentOnTitleBars: boolean;
  lockScreenImage: string;
  isReadable: boolean;
}

/** Trạng thái pin — `hasBattery=false` khi là máy tính để bàn. */
export interface BatteryStatus {
  name: string;
  hasBattery: boolean;
  status: string;
  chargePercent: number | null;
  estimatedMinutesRemaining: number | null;
  designCapacityMwh: number | null;
  fullChargeCapacityMwh: number | null;
}

/** Một power scheme có sẵn trên máy. */
export interface PowerPlanOption {
  guid: string;
  key: "balanced" | "high" | "power_saver" | "ultimate" | "unknown";
  name: string;
  isActive: boolean;
}

/** Nhóm Pin & Nguồn. Timeout tính bằng GIÂY, 0 = never. */
export interface PowerSettings {
  activeSchemeGuid: string;
  activePlan: string;
  availablePlans: PowerPlanOption[];
  monitorTimeoutAc: number;
  monitorTimeoutDc: number;
  sleepTimeoutAc: number;
  sleepTimeoutDc: number;
  hibernateTimeoutAc: number;
  hibernateTimeoutDc: number;
  battery: BatteryStatus;
}

/** Nhóm Kích hoạt. */
export interface ActivationStatus {
  activated: boolean;
  statusCode: number;
  description: string;
  partialProductKey: string | null;
  gracePeriodDays: number | null;
}

/** Kết quả áp dụng 1 nhóm thiết lập. */
export interface ApplyResult {
  group: string;
  success: boolean;
  applied: string[];
  failed: string[];
  requiresSignout: boolean;
  requiresExplorerRestart: boolean;
  message: string;
}

/** Patch cho nhóm Định danh. */
export interface IdentityPatch {
  computerName?: string;
  organization?: string;
  timeZoneTzId?: string;
  locale?: {
    locale?: string;
    shortDate?: string;
    shortTime?: string;
    timeFormat24h?: boolean;
    decimal?: string;
    thousandSep?: string;
  };
  keyboardLayoutId?: number;
}

/** Patch cho nhóm Cá nhân hóa. */
export interface PersonalizationPatch {
  theme?: "light" | "dark" | "custom";
  wallpaperPath?: string;
  wallpaperStyle?: number;
  lockScreenImage?: string;
  desktopIcons?: DesktopIcons;
  accentColorId?: string;
  accentOnStartTaskbar?: number;
  accentOnTitleBars?: boolean;
}

/** Patch cho nhóm Pin & Nguồn. */
export interface PowerPatch {
  plan?: string;
  monitorTimeoutAc?: number;
  monitorTimeoutDc?: number;
  sleepTimeoutAc?: number;
  sleepTimeoutDc?: number;
  hibernateTimeoutAc?: number;
  hibernateTimeoutDc?: number;
}

/** Trạng thái quyền Administrator của app. */
export interface ElevationStatus {
  /** App đang chạy với quyền Administrator hay không. */
  isElevated: boolean;
  /** Cờ tự nâng quyền khi mở app có đang bật không. */
  autoElevate: boolean;
  /** Đường dẫn tới file exe của app. */
  appPath: string;
  /** True nếu app đang chạy ở chế độ dev (`tauri dev`). */
  devMode: boolean;
}
