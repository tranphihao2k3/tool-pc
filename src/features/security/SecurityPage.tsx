import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  ScanLine,
  Bug,
  Settings as SettingsIcon,
  ListChecks,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Clock,
  FolderOpen,
  FileText,
  Cpu,
  Download,
  X,
  Zap,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { Switch } from "@/shared/components/Switch";
import { Segmented } from "@/shared/components/Segmented";
import { ErrorState } from "@/shared/components/ErrorState";
import { useTauriCommand } from "@/shared/components/ErrorState";
import { formatDuration } from "@/shared/lib/utils";
import type {
  DefenderStatus,
  ScanJob,
  Threat,
  FirewallProfile,
} from "@/shared/types/system";

type Tab = "scan" | "threats" | "settings" | "exclusions" | "firewall";

const TABS: {
  key: Tab;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
}[] = [
  { key: "scan", icon: ScanLine, labelKey: "security.tab.scan" },
  { key: "threats", icon: Bug, labelKey: "security.tab.threats" },
  { key: "settings", icon: SettingsIcon, labelKey: "security.tab.settings" },
  { key: "exclusions", icon: ListChecks, labelKey: "security.tab.exclusions" },
  { key: "firewall", icon: Flame, labelKey: "security.tab.firewall" },
];

// =================================================================
// Mock fallback (khi chưa chạy trong Tauri / Defender không khả dụng)
// =================================================================

const MOCK_STATUS: DefenderStatus = {
  available: true,
  serviceRunning: true,
  antivirusEnabled: true,
  realtimeEnabled: true,
  behaviorMonitoringEnabled: true,
  cloudProtectionLevel: 2,
  signatureLastUpdated: new Date().toISOString(),
  signatureVersion: "1.421.124.0",
  appVersion: "4.18.24090.9",
  engineVersion: "1.1.24090.9",
  quickScanAgeHours: 3,
  fullScanAgeHours: 168,
  threatCount: 0,
};

const MOCK_THREATS: Threat[] = [
  {
    threatId: "MOCK-001",
    name: "Trojan:Win32/Wacatac.B!ml",
    path: "C:\\Users\\Demo\\Downloads\\suspicious.exe",
    isQuarantined: true,
    severity: "High",
    category: "Trojan",
    detectedAt: new Date(Date.now() - 86400000).toISOString(),
    action: "Quarantine",
  },
  {
    threatId: "MOCK-002",
    name: "PUA:Win32/MyCustomInstaller",
    path: "C:\\Program Files (x86)\\CustomInstaller\\uninst.exe",
    isQuarantined: false,
    severity: "Low",
    category: "PUA",
    detectedAt: new Date(Date.now() - 3600000).toISOString(),
    action: "Allow",
  },
];

const MOCK_FIREWALL: FirewallProfile[] = [
  {
    name: "Domain",
    enabled: true,
    inboundAction: "Block",
    outboundAction: "Allow",
    loggingEnabled: false,
  },
  {
    name: "Private",
    enabled: true,
    inboundAction: "Block",
    outboundAction: "Allow",
    loggingEnabled: false,
  },
  {
    name: "Public",
    enabled: true,
    inboundAction: "Block",
    outboundAction: "Allow",
    loggingEnabled: false,
  },
];

// =================================================================
// Main page
// =================================================================

export default function SecurityPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("scan");

  const statusQ = useTauriCommand<DefenderStatus>(
    "get_defender_status",
    undefined,
    { mock: MOCK_STATUS }
  );
  const threatsQ = useTauriCommand<Threat[]>("get_threats", undefined, {
    mock: MOCK_THREATS,
  });
  const firewallQ = useTauriCommand<FirewallProfile[]>(
    "get_firewall_profiles",
    undefined,
    { mock: MOCK_FIREWALL }
  );

  const status = statusQ.data;
  const threats = threatsQ.data ?? [];
  const firewall = firewallQ.data ?? [];

  if (statusQ.error && !status) {
    return (
      <ErrorState
        error={statusQ.error}
        onRetry={statusQ.refetch}
        title="Không tải được trạng thái Defender"
      />
    );
  }

  // Chưa có dữ liệu (đang tải lần đầu) → hiển thị skeleton.
  // Không được dùng `status!` vì `data` là `T | null` → crash khi render
  // lần đầu trước khi promise resolve.
  if (!status) {
    return (
      <div className="space-y-6">
        <div className="h-[104px] animate-pulse rounded-xl bg-white/[0.03]" />
        <div className="h-10 animate-pulse rounded-lg bg-white/[0.03]" />
        <div className="h-64 animate-pulse rounded-xl bg-white/[0.03]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header card: status tổng quan */}
      <DefenderOverview status={status} threatsCount={threats.length} />

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
                {entry.key === "threats" && threats.length > 0 && (
                  <span className="ml-1 rounded-full bg-danger/20 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                    {threats.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {tab === "scan" && (
        <ScanTab status={status} onScanComplete={() => threatsQ.refetch()} />
      )}
      {tab === "threats" && (
        <ThreatsTab
          threats={threats}
          onActionComplete={() => {
            threatsQ.refetch();
            statusQ.refetch();
          }}
        />
      )}
      {tab === "settings" && <SettingsTab status={status} />}
      {tab === "exclusions" && <ExclusionsTab />}
      {tab === "firewall" && (
        <FirewallTab
          profiles={firewall}
          onUpdate={() => firewallQ.refetch()}
        />
      )}
    </div>
  );
}

// =================================================================
// Header: Defender overview (UX-20 banner)
// =================================================================

function DefenderOverview({
  status,
  threatsCount,
}: {
  status: DefenderStatus;
  threatsCount: number;
}) {
  const { t } = useTranslation();

  let statusIcon = ShieldCheck;
  let statusLabel = t("security.status.protected", "Đang được bảo vệ");
  let statusTone = "text-success";
  if (!status.available) {
    statusIcon = ShieldOff;
    statusLabel = t("security.status.unavailable", "Không khả dụng");
    statusTone = "text-ink-muted";
  } else if (!status.antivirusEnabled || !status.realtimeEnabled) {
    statusIcon = ShieldAlert;
    statusLabel = t("security.status.atRisk", "Có rủi ro");
    statusTone = "text-warning";
  } else if (threatsCount > 0) {
    statusIcon = ShieldAlert;
    statusLabel = t("security.status.threats", "Có mối đe dọa");
    statusTone = "text-danger";
  }

  const Icon = statusIcon;
  const updatedAgo = status.signatureLastUpdated
    ? new Date(status.signatureLastUpdated)
    : null;

  return (
    <Card glow>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`grid h-14 w-14 place-items-center rounded-2xl ${
              !status.available
                ? "bg-white/5"
                : threatsCount > 0
                ? "bg-danger/15"
                : "bg-success/15"
            }`}
          >
            <Icon className={`h-7 w-7 ${statusTone}`} />
          </div>
          <div>
            <div className={`text-base font-semibold ${statusTone}`}>
              {statusLabel}
            </div>
            <div className="mt-0.5 text-xs text-ink-muted">
              {status.appVersion && `Defender v${status.appVersion} · `}
              Signature v{status.signatureVersion || "—"}
              {updatedAgo && ` · cập nhật ${formatRelative(updatedAgo)}`}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <StatusPill
            label={t("security.pill.realtime", "Realtime")}
            on={status.realtimeEnabled}
          />
          <StatusPill
            label={t("security.pill.cloud", "Cloud")}
            on={status.cloudProtectionLevel > 0}
            hint={`L${status.cloudProtectionLevel}`}
          />
          <StatusPill
            label={t("security.pill.behavior", "Behavior")}
            on={status.behaviorMonitoringEnabled}
          />
        </div>
      </div>
    </Card>
  );
}

function StatusPill({
  label,
  on,
  hint,
}: {
  label: string;
  on: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-2 w-2 rounded-full ${on ? "bg-success" : "bg-ink-subtle"}`}
      />
      <span className="text-ink-muted">
        {label}
        {hint && ` ${hint}`}
      </span>
    </div>
  );
}

function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.floor(h / 24);
  return `${days} ngày trước`;
}

// =================================================================
// Tab: Scan (UX-20)
// =================================================================

function ScanTab({
  status,
  onScanComplete,
}: {
  status: DefenderStatus;
  onScanComplete: () => void;
}) {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState<string | null>(null);
  const [job, setJob] = useState<ScanJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const id = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(id);
    }
  }, [error]);

  const handleScan = async (scanType: "quick" | "full") => {
    setScanning(scanType);
    setError(null);
    try {
      const result = await invoke<ScanJob>("start_defender_scan", {
        scanType,
        scanPath: null,
      });
      setJob(result);
      onScanComplete();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(null);
    }
  };

  const handleCustomScan = async () => {
    const path = window.prompt(
      t("security.scan.customPrompt", "Nhập đường dẫn folder cần quét (vd: C:\\Users):")
    );
    if (!path) return;
    setScanning("custom");
    setError(null);
    try {
      const result = await invoke<ScanJob>("start_defender_scan", {
        scanType: "custom",
        scanPath: path,
      });
      setJob(result);
      onScanComplete();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(null);
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    setError(null);
    setUpdateMsg(null);
    try {
      const msg = await invoke<string>("update_defender_signatures");
      setUpdateMsg(msg);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdating(false);
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
      {updateMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          {updateMsg}
        </div>
      )}

      <Card title={t("security.scan.title", "Quét virus")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ScanAction
            icon={Zap}
            title={t("security.scan.quick", "Quét nhanh")}
            desc={t(
              "security.scan.quickDesc",
              "Quét các vùng thường nhiễm (1-5 phút)"
            )}
            loading={scanning === "quick"}
            onClick={() => handleScan("quick")}
            primary
          />
          <ScanAction
            icon={Shield}
            title={t("security.scan.full", "Quét toàn bộ")}
            desc={t(
              "security.scan.fullDesc",
              "Quét tất cả ổ đĩa (vài giờ)"
            )}
            loading={scanning === "full"}
            onClick={() => handleScan("full")}
          />
          <ScanAction
            icon={FolderOpen}
            title={t("security.scan.custom", "Quét tùy chọn")}
            desc={t("security.scan.customDesc", "Chọn folder/path cụ thể")}
            loading={scanning === "custom"}
            onClick={handleCustomScan}
          />
        </div>
      </Card>

      {job && (
        <Card title={t("security.scan.lastResult", "Kết quả quét gần nhất")}>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">
                {t("security.scan.type", "Loại quét")}:{" "}
                <span className="font-medium text-ink">
                  {scanTypeLabel(job.scanType, t)}
                </span>
              </span>
              <span
                className={`pill ${
                  job.status === "completed"
                    ? "pill-success"
                    : job.status === "failed"
                    ? "pill-danger"
                    : "pill-warning"
                }`}
              >
                {job.status === "completed"
                  ? t("security.scan.completed", "Hoàn tất")
                  : job.status === "failed"
                  ? t("security.scan.failed", "Thất bại")
                  : t("security.scan.running", "Đang chạy")}
              </span>
            </div>
            {job.scanPath && (
              <div className="text-xs text-ink-muted">
                Path: <code className="text-ink">{job.scanPath}</code>
              </div>
            )}
            <div className="text-xs text-ink-muted">
              {t("security.scan.duration", "Thời lượng")}:{" "}
              {job.finishedAtMs
                ? formatDuration(job.finishedAtMs - job.startedAtMs)
                : t("security.scan.stillRunning", "đang chạy...")}
              {" · "}
              {job.threatsFound === 0
                ? t("security.scan.noThreats", "Không phát hiện mối đe dọa")
                : t("security.scan.foundThreats", {
                    count: job.threatsFound,
                    defaultValue: `Phát hiện ${job.threatsFound} mối đe dọa`,
                  })}
            </div>
            {job.message && (
              <div className="text-xs text-ink-muted">{job.message}</div>
            )}
          </div>
        </Card>
      )}

      <Card
        title={t("security.scan.signature", "Chữ ký bảo mật")}
        subtitle={t(
          "security.scan.signatureDesc",
          "Cập nhật chữ ký để Defender nhận diện malware mới nhất"
        )}
        action={
          <Button
            variant="secondary"
            onClick={handleUpdate}
            loading={updating}
          >
            <Download className="h-4 w-4" />
            {t("security.scan.updateNow", "Cập nhật ngay")}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat
            label={t("security.scan.lastUpdate", "Cập nhật")}
            value={
              status.signatureLastUpdated
                ? new Date(status.signatureLastUpdated).toLocaleDateString(
                    "vi-VN"
                  )
                : "—"
            }
          />
          <Stat
            label={t("security.scan.quickAge", "Quick scan")}
            value={
              status.quickScanAgeHours != null
                ? `${status.quickScanAgeHours}h trước`
                : "—"
            }
          />
          <Stat
            label={t("security.scan.fullAge", "Full scan")}
            value={
              status.fullScanAgeHours != null
                ? `${Math.floor(status.fullScanAgeHours / 24)}d trước`
                : "—"
            }
          />
          <Stat
            label={t("security.scan.threats", "Threats")}
            value={`${status.threatCount}`}
            tone={status.threatCount > 0 ? "danger" : "success"}
          />
        </div>
      </Card>
    </div>
  );
}

function ScanAction({
  icon: Icon,
  title,
  desc,
  loading,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  loading: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`rounded-lg border p-4 text-left transition disabled:opacity-50 ${
        primary
          ? "border-brand/40 bg-brand/10 hover:bg-brand/15"
          : "border-white/10 bg-white/[0.02] hover:bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-brand-200" />
        ) : (
          <Icon className="h-5 w-5 text-brand-200" />
        )}
        <div className="text-sm font-medium text-ink">{title}</div>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{desc}</p>
    </button>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "danger"
      ? "text-danger"
      : "text-ink";
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-2">
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
      <div className="text-[10px] text-ink-subtle">{label}</div>
    </div>
  );
}

function scanTypeLabel(st: string, t: (k: string, d: string) => string) {
  if (st === "quick") return t("security.scan.quick", "Quét nhanh");
  if (st === "full") return t("security.scan.full", "Quét toàn bộ");
  return t("security.scan.custom", "Quét tùy chọn");
}

// =================================================================
// Tab: Threats (UX-21)
// =================================================================

function ThreatsTab({
  threats,
  onActionComplete,
}: {
  threats: Threat[];
  onActionComplete: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const id = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(id);
    }
  }, [error]);

  const handleAct = async (threat: Threat, action: string) => {
    setBusy(`${threat.threatId}-${action}`);
    setError(null);
    try {
      await invoke("act_on_threat", { threatId: threat.threatId, action });
      onActionComplete();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title={t("security.threats.title", "Mối đe dọa hiện tại")}
      subtitle={
        threats.length === 0
          ? t("security.threats.empty", "Không có mối đe dọa nào")
          : t("security.threats.count", { count: threats.length, defaultValue: `${threats.length} mối đe dọa` })
      }
    >
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {threats.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <ShieldCheck className="h-10 w-10 text-success" />
          <div>
            <p className="text-sm text-ink">
              {t("security.threats.allClean", "Máy tính của bạn an toàn")}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {t(
                "security.threats.allCleanDesc",
                "Defer không phát hiện mối đe dọa nào đang hoạt động"
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {threats.map((threat) => (
            <div
              key={threat.threatId}
              className="rounded-md border border-white/5 bg-white/[0.02] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Bug
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      threat.severity === "High" || threat.severity === "Severe"
                        ? "text-danger"
                        : threat.severity === "Moderate"
                        ? "text-warning"
                        : "text-ink-muted"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">
                        {threat.name}
                      </span>
                      <SeverityBadge severity={threat.severity} />
                      {threat.isQuarantined && (
                        <span className="pill-warning text-[10px]">
                          {t("security.threats.quarantined", "Đã cách ly")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-ink-muted">
                      {threat.path}
                    </div>
                    <div className="mt-1 text-[11px] text-ink-subtle">
                      {threat.category} · {new Date(threat.detectedAt).toLocaleString("vi-VN")}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {threat.isQuarantined ? (
                    <Button
                      variant="secondary"
                      onClick={() => handleAct(threat, "restore")}
                      loading={busy === `${threat.threatId}-restore`}
                      className="text-xs"
                    >
                      {t("security.threats.restore", "Khôi phục")}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => handleAct(threat, "quarantine")}
                      loading={busy === `${threat.threatId}-quarantine`}
                      className="text-xs"
                    >
                      {t("security.threats.quarantine", "Cách ly")}
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    onClick={() => handleAct(threat, "remove")}
                    loading={busy === `${threat.threatId}-remove`}
                    className="text-xs"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("security.threats.remove", "Xóa")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: Threat["severity"] }) {
  const map: Record<Threat["severity"], { className: string; label: string }> = {
    Severe: { className: "bg-danger/20 text-danger", label: "Nghiêm trọng" },
    High: { className: "bg-danger/20 text-danger", label: "Cao" },
    Moderate: { className: "bg-warning/20 text-warning", label: "Trung bình" },
    Low: { className: "bg-info/20 text-info", label: "Thấp" },
    Unknown: { className: "bg-white/10 text-ink-muted", label: "Không rõ" },
  };
  const cfg = map[severity];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// =================================================================
// Tab: Settings (UX-22)
// =================================================================

function SettingsTab({ status }: { status: DefenderStatus }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const id = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(id);
    }
  }, [error]);
  useEffect(() => {
    if (success) {
      const id = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(id);
    }
  }, [success]);

  const setPref = async (key: string, value: string) => {
    setBusy(key);
    setError(null);
    try {
      const msg = await invoke<string>("set_defender_preference", {
        key,
        value,
      });
      setSuccess(msg);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
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
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}

      <Card
        title={t("security.settings.protection", "Bảo vệ thời gian thực")}
        subtitle={t(
          "security.settings.protectionDesc",
          "Các tính năng chính của Defender"
        )}
      >
        <Row
          label={t("security.settings.realtime", "Realtime Protection")}
          desc={t(
            "security.settings.realtimeDesc",
            "Giám sát file/process đang chạy — khi TẮT, malware có thể chạy tự do"
          )}
          control={
            <Switch
              checked={status.realtimeEnabled}
              onChange={(v) =>
                setPref("DisableRealtimeMonitoring", v ? "0" : "1")
              }
            />
          }
        />
        <Row
          label={t("security.settings.behavior", "Behavior Monitoring")}
          desc={t(
            "security.settings.behaviorDesc",
            "Phát hiện hành vi bất thường của process (vd: ransomware)"
          )}
          control={
            <Switch
              checked={status.behaviorMonitoringEnabled}
              onChange={(v) =>
                setPref("DisableBehaviorMonitoring", v ? "0" : "1")
              }
            />
          }
        />
        <Row
          label={t("security.settings.scriptScan", "Script Scanning")}
          desc={t(
            "security.settings.scriptScanDesc",
            "Quét PowerShell/VBScript macro khi chạy"
          )}
          control={
            <Switch
              checked={true}
              onChange={(v) => setPref("DisableScriptScanning", v ? "0" : "1")}
            />
          }
        />
        <Row
          label={t("security.settings.archiveScan", "Archive Scanning")}
          desc={t(
            "security.settings.archiveScanDesc",
            "Quét bên trong file nén .zip/.rar/.7z"
          )}
          control={
            <Switch
              checked={true}
              onChange={(v) =>
                setPref("DisableArchiveScanning", v ? "0" : "1")
              }
            />
          }
        />
      </Card>

      <Card
        title={t("security.settings.cloud", "Cloud Protection")}
        subtitle={t(
          "security.settings.cloudDesc",
          "Gửi metadata lên Microsoft để phân tích nhanh hơn"
        )}
      >
        <Row
          label={t("security.settings.cloudLevel", "Mức bảo vệ Cloud")}
          desc={t(
            "security.settings.cloudLevelDesc",
            "High = block ngay khi nghi ngờ; Basic = cảnh báo trước"
          )}
          control={
            <Segmented
              value={String(status.cloudProtectionLevel)}
              onChange={(v) => setPref("CloudBlockLevel", v)}
              options={[
                { value: "0", label: "Off" },
                { value: "2", label: "High" },
                { value: "4", label: "High+" },
                { value: "6", label: "Max" },
              ]}
            />
          }
        />
      </Card>

      {busy && (
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("security.settings.applying", "Đang áp dụng...")}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  desc,
  control,
}: {
  label: string;
  desc: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="mt-0.5 text-xs text-ink-muted">{desc}</div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

// =================================================================
// Tab: Exclusions (UX-23)
// =================================================================

function ExclusionsTab() {
  const { t } = useTranslation();
  const [exclusions, setExclusions] = useState<
    { id: string; type: string; value: string; scope: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addType, setAddType] = useState<"Path" | "Process" | "FileType">(
    "Path"
  );
  const [addValue, setAddValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadExclusions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<
        { id: string; type: string; value: string; scope: string }[]
      >("get_defender_exclusions");
      setExclusions(data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExclusions();
  }, []);

  useEffect(() => {
    if (error) {
      const id = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(id);
    }
  }, [error]);

  const handleAdd = async () => {
    if (!addValue.trim()) return;
    setBusy("add");
    setError(null);
    try {
      await invoke("add_defender_exclusion", {
        exclType: addType,
        value: addValue.trim(),
      });
      setAddValue("");
      await loadExclusions();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (type: string, value: string) => {
    setBusy(`remove-${value}`);
    setError(null);
    try {
      await invoke("remove_defender_exclusion", { exclType: type, value });
      await loadExclusions();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
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

      <Card
        title={t("security.exclusions.title", "Danh sách loại trừ")}
        subtitle={t(
          "security.exclusions.subtitle",
          "File/process trong danh sách này sẽ KHÔNG bị Defender quét. Chỉ thêm khi chắc chắn an toàn."
        )}
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-ink-muted">
              {t("security.exclusions.type", "Loại")}
            </label>
            <Segmented
              value={addType}
              onChange={(v) => setAddType(v as "Path" | "Process" | "FileType")}
              options={[
                { value: "Path", label: "Folder/File" },
                { value: "Process", label: "Process" },
                { value: "FileType", label: "Extension" },
              ]}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-ink-muted">
              {t("security.exclusions.value", "Giá trị")}
            </label>
            <input
              type="text"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              placeholder={
                addType === "Path"
                  ? "C:\\MyApp"
                  : addType === "Process"
                  ? "myapp.exe"
                  : ".tmp"
              }
              className="w-full rounded-md border border-white/10 bg-bg-100 px-3 py-1.5 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
            />
          </div>
          <Button
            variant="primary"
            onClick={handleAdd}
            loading={busy === "add"}
            disabled={!addValue.trim()}
          >
            <Plus className="h-4 w-4" />
            {t("security.exclusions.add", "Thêm")}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : exclusions.length === 0 ? (
          <div className="py-8 text-center text-sm text-ink-muted">
            {t("security.exclusions.empty", "Chưa có exclusion nào")}
          </div>
        ) : (
          <div className="space-y-1">
            {exclusions.map((ex) => (
              <div
                key={`${ex.type}-${ex.value}`}
                className="flex items-center justify-between gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {ex.type === "Path" ? (
                    <FolderOpen className="h-4 w-4 text-ink-muted" />
                  ) : ex.type === "Process" ? (
                    <Cpu className="h-4 w-4 text-ink-muted" />
                  ) : (
                    <FileText className="h-4 w-4 text-ink-muted" />
                  )}
                  <span className="pill text-[10px]">{ex.type}</span>
                  <span className="truncate font-mono text-xs text-ink">
                    {ex.value}
                  </span>
                </div>
                <button
                  onClick={() => handleRemove(ex.type, ex.value)}
                  disabled={busy === `remove-${ex.value}`}
                  className="rounded-md p-1 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  aria-label="Remove"
                >
                  {busy === `remove-${ex.value}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="ghost"
          onClick={loadExclusions}
          loading={loading}
          className="mt-3 text-xs"
        >
          <RefreshCw className="h-3 w-3" />
          {t("common.refresh", "Làm mới")}
        </Button>
      </Card>
    </div>
  );
}

// =================================================================
// Tab: Firewall (UX-24)
// =================================================================

function FirewallTab({
  profiles,
  onUpdate,
}: {
  profiles: FirewallProfile[];
  onUpdate: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const id = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(id);
    }
  }, [error]);

  const handleToggle = async (profile: FirewallProfile, enabled: boolean) => {
    setBusy(profile.name);
    setError(null);
    try {
      await invoke("set_firewall_profile", {
        profile: profile.name,
        enabled,
      });
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
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

      <Card
        title={t("security.firewall.title", "Windows Firewall")}
        subtitle={t(
          "security.firewall.subtitle",
          "Quản lý 3 profile: Domain (công ty), Private (nhà), Public (quán cafe)"
        )}
      >
        <div className="space-y-2">
          {profiles.map((p) => {
            const tone = p.enabled ? "success" : "warning";
            const Icon = p.enabled ? ShieldCheck : ShieldOff;
            return (
              <div
                key={p.name}
                className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Icon
                    className={`h-5 w-5 ${
                      p.enabled ? "text-success" : "text-warning"
                    }`}
                  />
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {p.name}
                      <span
                        className={`ml-2 pill text-[10px] ${
                          tone === "success" ? "pill-success" : "pill-warning"
                        }`}
                      >
                        {p.enabled
                          ? t("security.firewall.on", "Đang bật")
                          : t("security.firewall.off", "Đang tắt")}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      Inbound: <code>{p.inboundAction}</code> · Outbound:{" "}
                      <code>{p.outboundAction}</code> · Log:{" "}
                      {p.loggingEnabled ? "on" : "off"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {busy === p.name ? (
                    <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
                  ) : p.enabled ? (
                    <Button
                      variant="secondary"
                      onClick={() => handleToggle(p, false)}
                      className="text-xs"
                    >
                      <PowerOff className="h-3 w-3" />
                      {t("security.firewall.turnOff", "Tắt")}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => handleToggle(p, true)}
                      className="text-xs"
                    >
                      <Power className="h-3 w-3" />
                      {t("security.firewall.turnOn", "Bật")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-md border border-info/20 bg-info/5 p-3 text-xs text-ink-muted">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <div>
              <p className="font-medium text-ink">
                {t("security.firewall.note", "Khuyến nghị")}
              </p>
              <p className="mt-1">
                {t(
                  "security.firewall.noteDesc",
                  "Giữ firewall BẬT cho cả 3 profile. Tắt chỉ khi debug network và tạm thời."
                )}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
