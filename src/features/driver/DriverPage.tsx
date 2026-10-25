import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  ScanLine,
  HardDrive,
  Save,
  FolderOpen,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Shield,
  ShieldOff,
  Filter,
  Package,
  Cpu,
  MonitorPlay,
  Network,
  CircuitBoard,
  MemoryStick,
  Webcam,
  Usb,
  Keyboard,
  MousePointer,
  FileText,
  Layers,
} from "lucide-react";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { ErrorState, useTauriCommand } from "@/shared/components/ErrorState";
import { formatBytes, formatDuration } from "@/shared/lib/utils";
import DriverLibraryTab from "./DriverLibraryTab";
import type {
  DriverInfo,
  DriverSummary,
  DriverBackupReport,
} from "@/shared/types/system";

type Tab = "overview" | "list" | "backup" | "library";

// =================================================================
// Mocks (khi chạy ngoài Tauri / WMI fail)
// =================================================================

const MOCK_DRIVERS: DriverInfo[] = [
  {
    deviceName: "NVIDIA GeForce RTX 4070",
    deviceClass: "Display",
    currentVersion: "31.0.15.3640",
    driverDate: "2024-04-22",
    provider: "NVIDIA Corporation",
    infName: "nvdm.inf",
    isSigned: true,
    signer: "Microsoft Windows Hardware Compatibility Publisher",
    hardwareId: "PCI\\VEN_10DE&DEV_2684",
    latestVersion: null,
    updateAvailable: false,
  },
  {
    deviceName: "Intel Wi-Fi 6E AX211",
    deviceClass: "Net",
    currentVersion: "22.140.0.3",
    driverDate: "2023-11-15",
    provider: "Intel Corporation",
    infName: "Netwtwoc.inf",
    isSigned: true,
    signer: "Microsoft Windows Hardware Compatibility Publisher",
    hardwareId: "PCI\\VEN_8086&DEV_2725",
    latestVersion: null,
    updateAvailable: false,
  },
  {
    deviceName: "Realtek Audio",
    deviceClass: "Media",
    currentVersion: "6.0.9285.1",
    driverDate: "2022-08-03",
    provider: "Realtek Semiconductor Corp.",
    infName: "hdxrt.inf",
    isSigned: true,
    signer: "Microsoft Windows Hardware Compatibility Publisher",
    hardwareId: "HDAUDIO\\FUNC_01&VEN_10EC",
    latestVersion: null,
    updateAvailable: false,
  },
  {
    deviceName: "Unknown Device (Unsigned)",
    deviceClass: "System",
    currentVersion: "1.0.0.0",
    driverDate: "2020-01-15",
    provider: "Unknown",
    infName: "oem123.inf",
    isSigned: false,
    signer: "",
    hardwareId: "USB\\VID_1234&PID_5678",
    latestVersion: null,
    updateAvailable: false,
  },
  {
    deviceName: "Samsung NVMe SSD Controller",
    deviceClass: "SCSIAdapter",
    currentVersion: "3.3.0.2",
    driverDate: "2024-01-08",
    provider: "Samsung Electronics",
    infName: "stornvme.inf",
    isSigned: true,
    signer: "Microsoft Windows Hardware Compatibility Publisher",
    hardwareId: "PCI\\VEN_144D&DEV_A808",
    latestVersion: null,
    updateAvailable: false,
  },
  {
    deviceName: "Logitech BRIO 4K Webcam",
    deviceClass: "Camera",
    currentVersion: "5.2.0.5150",
    driverDate: "2021-12-12",
    provider: "Logitech Inc.",
    infName: "lvuvc64.inf",
    isSigned: true,
    signer: "Microsoft Windows Hardware Compatibility Publisher",
    hardwareId: "USB\\VID_046D&PID_086B",
    latestVersion: null,
    updateAvailable: false,
  },
  {
    deviceName: "Intel Chipset SATA AHCI Controller",
    deviceClass: "HDC",
    currentVersion: "18.0.4.1146",
    driverDate: "2023-04-19",
    provider: "Intel Corporation",
    infName: "iaahcic.inf",
    isSigned: true,
    signer: "Microsoft Windows Hardware Compatibility Publisher",
    hardwareId: "PCI\\VEN_8086&DEV_2822",
    latestVersion: null,
    updateAvailable: false,
  },
  {
    deviceName: "AMD Chipset",
    deviceClass: "System",
    currentVersion: "5.05.16.529",
    driverDate: "2024-02-20",
    provider: "Advanced Micro Devices",
    infName: "amdi2c.inf",
    isSigned: true,
    signer: "Microsoft Windows Hardware Compatibility Publisher",
    hardwareId: "PCI\\VEN_1022&DEV_790B",
    latestVersion: null,
    updateAvailable: false,
  },
];

const MOCK_SUMMARY: DriverSummary = {
  total: 8,
  unsigned: 1,
  withUpdates: 0,
  oldDrivers: 3,
  classes: [
    { name: "System", count: 2 },
    { name: "Display", count: 1 },
    { name: "Media", count: 1 },
    { name: "Net", count: 1 },
    { name: "SCSIAdapter", count: 1 },
    { name: "Camera", count: 1 },
    { name: "HDC", count: 1 },
  ],
};

const TABS: {
  key: Tab;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
}[] = [
  { key: "overview", icon: HardDrive, labelKey: "driver.tab.overview" },
  { key: "list", icon: ScanLine, labelKey: "driver.tab.list" },
  { key: "backup", icon: Save, labelKey: "driver.tab.backup" },
  { key: "library", icon: Layers, labelKey: "driver.tab.library" },
];

// =================================================================
// Main page
// =================================================================

export default function DriverPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("overview");

  const driversQ = useTauriCommand<DriverInfo[]>("list_drivers", undefined, {
    mock: MOCK_DRIVERS,
  });
  const summaryQ = useTauriCommand<DriverSummary>(
    "get_driver_summary",
    undefined,
    { mock: MOCK_SUMMARY }
  );

  const drivers = driversQ.data ?? [];
  const summary = summaryQ.data;

  if (summaryQ.error && !summary) {
    return (
      <ErrorState
        error={summaryQ.error}
        onRetry={summaryQ.refetch}
        title="Không tải được thông tin driver"
      />
    );
  }

  const refetchAll = () => {
    driversQ.refetch();
    summaryQ.refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <DriverHeader
        summary={summary}
        loading={driversQ.loading || summaryQ.loading}
        onRefresh={refetchAll}
      />

      {/* Tabs */}
      <div className="border-b border-white/5">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const active = tab === entry.key;
            return (
              <button
                key={entry.key}
                onClick={() => setTab(entry.key)}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "border-brand text-brand-100"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(entry.labelKey, entry.key)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab summary={summary} drivers={drivers} />}
      {tab === "list" && (
        <ListTab
          drivers={drivers}
          loading={driversQ.loading}
          onRefetch={driversQ.refetch}
        />
      )}
      {tab === "backup" && <BackupTab />}
      {tab === "library" && <DriverLibraryTab />}
    </div>
  );
}

// =================================================================
// Header (UX-25 banner)
// =================================================================

function DriverHeader({
  summary,
  loading,
  onRefresh,
}: {
  summary: DriverSummary | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  const healthTone =
    !summary || summary.unsigned > 0
      ? "warning"
      : summary.oldDrivers > summary.total / 2
      ? "info"
      : "success";

  const healthLabel =
    !summary
      ? "—"
      : summary.unsigned > 0
      ? t("driver.health.hasIssues", "Có driver cần chú ý")
      : summary.oldDrivers > summary.total / 2
      ? t("driver.health.manyOld", "Nhiều driver cũ")
      : t("driver.health.good", "Tất cả ổn định");

  return (
    <Card glow>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`grid h-14 w-14 place-items-center rounded-2xl ${
              healthTone === "warning"
                ? "bg-warning/15"
                : healthTone === "info"
                ? "bg-info/15"
                : "bg-success/15"
            }`}
          >
            {healthTone === "warning" ? (
              <ShieldOff className="h-7 w-7 text-warning" />
            ) : healthTone === "info" ? (
              <AlertTriangle className="h-7 w-7 text-info" />
            ) : (
              <Shield className="h-7 w-7 text-success" />
            )}
          </div>
          <div>
            <div
              className={`text-base font-semibold ${
                healthTone === "warning"
                  ? "text-warning"
                  : healthTone === "info"
                  ? "text-info"
                  : "text-success"
              }`}
            >
              {healthLabel}
            </div>
            <div className="mt-0.5 text-xs text-ink-muted">
              {summary
                ? t("driver.header.summary", {
                    total: summary.total,
                    unsigned: summary.unsigned,
                    defaultValue: `${summary.total} driver · ${summary.unsigned} chưa ký`,
                  })
                : "—"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          {summary && (
            <>
              <HeaderStat
                label={t("driver.header.total", "Tổng")}
                value={String(summary.total)}
              />
              <HeaderStat
                label={t("driver.header.unsigned", "Chưa ký")}
                value={String(summary.unsigned)}
                tone={summary.unsigned > 0 ? "warning" : "muted"}
              />
              <HeaderStat
                label={t("driver.header.old", "Cũ > 2 năm")}
                value={String(summary.oldDrivers)}
                tone={summary.oldDrivers > 0 ? "info" : "muted"}
              />
            </>
          )}
          <Button variant="secondary" onClick={onRefresh} loading={loading}>
            <RefreshCw className="h-4 w-4" />
            {t("common.refresh", "Làm mới")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function HeaderStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "warning" | "info" | "success";
}) {
  const color =
    tone === "warning"
      ? "text-warning"
      : tone === "info"
      ? "text-info"
      : tone === "success"
      ? "text-success"
      : "text-ink";
  return (
    <div className="flex flex-col">
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
      <span className="text-[10px] text-ink-subtle">{label}</span>
    </div>
  );
}

// =================================================================
// Tab: Overview (UX-25)
// =================================================================

function OverviewTab({
  summary,
  drivers,
}: {
  /** `null` khi backend chưa trả về — mọi field phải xử lý null-safe. */
  summary: DriverSummary | null;
  drivers: DriverInfo[];
}) {
  const { t } = useTranslation();

  // Class với icon
  const classIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    Display: MonitorPlay,
    Net: Network,
    Media: MonitorPlay,
    System: Cpu,
    SCSIAdapter: HardDrive,
    HDC: HardDrive,
    Camera: Webcam,
    HIDClass: Keyboard,
    Mouse: MousePointer,
    USB: Usb,
    MemoryStick: MemoryStick,
    Processor: Cpu,
    SystemBoard: CircuitBoard,
  };

  // Chưa có dữ liệu → hiển thị skeleton thay vì crash khi `summary` là null.
  if (!summary) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title={t("driver.overview.issues", "Vấn đề phát hiện")}>
          <div className="space-y-2">
            <div className="h-8 animate-pulse rounded-lg bg-white/5" />
            <div className="h-8 animate-pulse rounded-lg bg-white/5" />
          </div>
        </Card>
        <Card
          title={t("driver.overview.distribution", "Phân bố theo loại")}
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[60px] animate-pulse rounded-lg bg-white/[0.02]"
              />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Health issues */}
      <Card title={t("driver.overview.issues", "Vấn đề phát hiện")}>
        <div className="space-y-2">
          {summary.unsigned > 0 && (
            <IssueRow
              icon={ShieldOff}
              tone="warning"
              text={t("driver.issue.unsigned", {
                count: summary.unsigned,
                defaultValue: `${summary.unsigned} driver chưa được ký số`,
              })}
            />
          )}
          {summary.oldDrivers > 0 && (
            <IssueRow
              icon={Clock}
              tone="info"
              text={t("driver.issue.old", {
                count: summary.oldDrivers,
                defaultValue: `${summary.oldDrivers} driver đã cũ (>2 năm)`,
              })}
            />
          )}
          {summary.withUpdates > 0 && (
            <IssueRow
              icon={RefreshCw}
              tone="info"
              text={t("driver.issue.update", {
                count: summary.withUpdates,
                defaultValue: `${summary.withUpdates} driver có bản cập nhật`,
              })}
            />
          )}
          {summary.unsigned === 0 &&
            summary.oldDrivers === 0 &&
            summary.withUpdates === 0 && (
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                {t("driver.issue.none", "Không phát hiện vấn đề")}
              </div>
            )}
        </div>
      </Card>

      {/* Distribution by class */}
      <Card
        title={t("driver.overview.distribution", "Phân bố theo loại")}
        subtitle={t(
          "driver.overview.distributionDesc",
          "Tổng số driver theo DeviceClass"
        )}
        className="lg:col-span-2"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {summary.classes.map((c) => {
            const Icon = classIcons[c.name] || Package;
            const percent =
              summary.total > 0 ? (c.count / summary.total) * 100 : 0;
            return (
              <div
                key={c.name}
                className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/15">
                  <Icon className="h-4 w-4 text-brand-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">
                      {c.name}
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      {c.count}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full bg-brand-gradient"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Top 5 newest / oldest */}
      <Card
        title={t("driver.overview.newest", "Driver mới nhất")}
        subtitle={t("driver.overview.newestDesc", "5 driver có date gần đây nhất")}
        className="lg:col-span-3"
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {sortByDate(drivers)
            .slice(0, 5)
            .map((d, i) => (
              <DriverRow key={i} driver={d} compact />
            ))}
        </div>
      </Card>
    </div>
  );
}

function IssueRow({
  icon: Icon,
  text,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  tone: "warning" | "info" | "success";
}) {
  const color =
    tone === "warning"
      ? "text-warning"
      : tone === "info"
      ? "text-info"
      : "text-success";
  return (
    <div className={`flex items-center gap-2 text-sm ${color}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function Clock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function sortByDate(drivers: DriverInfo[]): DriverInfo[] {
  return [...drivers].sort((a, b) => b.driverDate.localeCompare(a.driverDate));
}

// =================================================================
// Tab: List (UX-26)
// =================================================================

function ListTab({
  drivers,
  loading,
  onRefetch,
}: {
  drivers: DriverInfo[];
  loading: boolean;
  onRefetch: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [filterUnsigned, setFilterUnsigned] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>("");

  // Lấy danh sách class duy nhất
  const classes = useMemo(() => {
    const set = new Set<string>();
    drivers.forEach((d) => {
      if (d.deviceClass) set.add(d.deviceClass);
    });
    return Array.from(set).sort();
  }, [drivers]);

  // Filter client-side
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return drivers.filter((d) => {
      if (filterUnsigned && d.isSigned) return false;
      if (selectedClass && d.deviceClass !== selectedClass) return false;
      if (!q) return true;
      return (
        d.deviceName.toLowerCase().includes(q) ||
        d.deviceClass.toLowerCase().includes(q) ||
        d.provider.toLowerCase().includes(q) ||
        d.infName.toLowerCase().includes(q)
      );
    });
  }, [drivers, search, filterUnsigned, selectedClass]);

  return (
    <div className="space-y-4">
      <Card
        title={t("driver.list.title", "Danh sách driver")}
        subtitle={t("driver.list.subtitle", {
          count: drivers.length,
          defaultValue: `${drivers.length} driver đã cài`,
        })}
        action={
          <Button variant="secondary" onClick={onRefetch} loading={loading}>
            <RefreshCw className="h-4 w-4" />
            {t("common.refresh", "Làm mới")}
          </Button>
        }
      >
        {/* Filters */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("driver.list.searchPlaceholder", "Tìm theo tên, class, provider…")}
              className="w-full rounded-md border border-white/10 bg-bg-100 py-1.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
            />
          </div>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="rounded-md border border-white/10 bg-bg-100 px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          >
            <option value="">{t("driver.list.allClasses", "Tất cả loại")}</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-bg-100 px-3 py-1.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={filterUnsigned}
              onChange={(e) => setFilterUnsigned(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-bg-100 text-brand focus:ring-brand"
            />
            <Filter className="h-3.5 w-3.5" />
            {t("driver.list.unsignedOnly", "Chỉ chưa ký")}
          </label>
        </div>

        {/* List */}
        {loading && drivers.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-ink-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-muted">
            {t("driver.list.empty", "Không tìm thấy driver nào")}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((d, i) => (
              <DriverRow key={`${d.infName}-${i}`} driver={d} />
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mt-3 text-xs text-ink-muted">
            {t("driver.list.showing", {
              shown: filtered.length,
              total: drivers.length,
              defaultValue: `Hiển thị ${filtered.length}/${drivers.length}`,
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function DriverRow({
  driver: d,
  compact = false,
}: {
  driver: DriverInfo;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-white/5 bg-white/[0.02] ${
        compact ? "p-2" : "p-3"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {d.isSigned ? (
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : (
            <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-ink">
                {d.deviceName || "(unknown)"}
              </span>
              {d.deviceClass && (
                <span className="pill text-[10px]">{d.deviceClass}</span>
              )}
              {!d.isSigned && (
                <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                  Unsigned
                </span>
              )}
            </div>
            {!compact && (
              <div className="mt-1 space-y-0.5 text-[11px] text-ink-muted">
                <div className="flex flex-wrap gap-x-3">
                  <span>
                    <span className="text-ink-subtle">Version:</span>{" "}
                    <code className="text-ink">{d.currentVersion || "—"}</code>
                  </span>
                  <span>
                    <span className="text-ink-subtle">Date:</span>{" "}
                    {d.driverDate || "—"}
                  </span>
                </div>
                <div className="truncate">
                  <span className="text-ink-subtle">Provider:</span>{" "}
                  {d.provider || "—"}
                </div>
                <div className="flex items-center gap-1 truncate">
                  <FileText className="h-3 w-3 shrink-0" />
                  <code className="truncate text-ink-subtle">
                    {d.infName}
                  </code>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =================================================================
// Tab: Backup (UX-27)
// =================================================================

function BackupTab() {
  const { t } = useTranslation();
  const [targetDir, setTargetDir] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DriverBackupReport | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const id = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(id);
    }
  }, [error]);

  useEffect(() => {
    if (successMsg) {
      const id = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(id);
    }
  }, [successMsg]);

  // Default path: %USERPROFILE%\Documents\PCManagerPro\Drivers
  useEffect(() => {
    const fallback = `C:\\Users\\Public\\Documents\\PCManagerPro\\Drivers`;
    setTargetDir(fallback);
  }, []);

  const handleBackup = async () => {
    if (!targetDir.trim()) {
      setError("Vui lòng chọn folder đích");
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const result = await invoke<DriverBackupReport>("backup_drivers", {
        targetDir: targetDir.trim(),
      });
      setReport(result);
      setSuccessMsg(`Đã backup ${result.exportedCount} driver`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!targetDir.trim()) return;
    try {
      await invoke("open_backup_folder", { path: targetDir.trim() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          {successMsg}
        </div>
      )}

      <Card
        title={t("driver.backup.title", "Backup driver ra file")}
        subtitle={t(
          "driver.backup.subtitle",
          "Lưu trữ driver đang cài để phục hồi nhanh khi cài lại Windows hoặc đổi phần cứng"
        )}
      >
        <div className="mb-4 rounded-lg border border-info/20 bg-info/5 p-3 text-xs text-ink-muted">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <div>
              <p className="font-medium text-ink">
                {t("driver.backup.requireAdmin", "Yêu cầu quyền Administrator")}
              </p>
              <p className="mt-1">
                {t(
                  "driver.backup.requireAdminDesc",
                  "Lệnh pnputil cần quyền admin. Nếu app chưa chạy elevated, hãy đóng và mở lại bằng Run as administrator."
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs text-ink-muted">
            {t("driver.backup.targetDir", "Folder đích")}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              placeholder="C:\Users\...\Documents\PCManagerPro\Drivers"
              className="flex-1 rounded-md border border-white/10 bg-bg-100 px-3 py-1.5 font-mono text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
            />
            <Button
              variant="secondary"
              onClick={handleOpenFolder}
              disabled={!targetDir.trim()}
            >
              <FolderOpen className="h-4 w-4" />
              {t("driver.backup.open", "Mở")}
            </Button>
          </div>
        </div>

        <Button
          variant="primary"
          onClick={handleBackup}
          loading={busy}
          disabled={!targetDir.trim()}
        >
          <Save className="h-4 w-4" />
          {t("driver.backup.start", "Bắt đầu backup")}
        </Button>
      </Card>

      {report && (
        <Card title={t("driver.backup.report", "Kết quả backup")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ReportStat
              label={t("driver.backup.exported", "Driver đã export")}
              value={String(report.exportedCount)}
              tone="success"
            />
            <ReportStat
              label={t("driver.backup.size", "Tổng dung lượng")}
              value={formatBytes(report.totalSizeBytes)}
              tone="info"
            />
            <ReportStat
              label={t("driver.backup.duration", "Thời gian")}
              value={formatDuration(report.durationMs)}
            />
          </div>
          <div className="mt-3 truncate rounded-md border border-white/5 bg-white/[0.02] p-2 font-mono text-xs text-ink-muted">
            {report.targetDir}
          </div>
        </Card>
      )}

      <Card
        title={t("driver.backup.howTo", "Cách sử dụng")}
        subtitle={t("driver.backup.howToDesc", "Khi nào cần backup?")}
      >
        <ol className="space-y-2 text-sm text-ink-muted">
          <li className="flex gap-2">
            <span className="text-brand-200">1.</span>
            {t("driver.backup.step1", "Trước khi cập nhật Windows lên version mới")}
          </li>
          <li className="flex gap-2">
            <span className="text-brand-200">2.</span>
            {t("driver.backup.step2", "Trước khi cài lại Windows / format máy")}
          </li>
          <li className="flex gap-2">
            <span className="text-brand-200">3.</span>
            {t(
              "driver.backup.step3",
              "Sau khi mua phần cứng mới, cần driver gốc từ nhà sản xuất"
            )}
          </li>
          <li className="flex gap-2">
            <span className="text-brand-200">4.</span>
            {t(
              "driver.backup.step4",
              "Restore: chạy 'pnputil /add-driver <folder>\\*.inf /install' trong CMD admin"
            )}
          </li>
        </ol>
      </Card>
    </div>
  );
}

function ReportStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "success" | "info";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "info"
      ? "text-info"
      : "text-ink";
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-3">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-ink-subtle">{label}</div>
    </div>
  );
}
