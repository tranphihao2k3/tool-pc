import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import {
  AppWindow,
  Trash2,
  HardDrive,
  FileX2,
  FolderSearch,
  Files,
  Folder,
  Undo2,
  Battery,
  Zap,
  Network,
  RefreshCw,
  Search,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  PlayCircle,
  ShieldAlert,
  Save,
  Copy,
  ListFilter,
  Power,
  CircleSlash,
} from "lucide-react";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { ProgressBar } from "@/shared/components/ProgressBar";
import { formatBytes, formatPercent } from "@/shared/lib/utils";
import type {
  ToolId,
  InstalledAppForUninstall,
  DiskCleanupReport,
  DefragReport,
  ShredReport,
  RegistryScanReport,
  DuplicateScanReport,
  LargeFileReport,
  RestorePointReport,
  PowerPlan,
  SetPowerPlanReport,
  NetworkResetReport,
  BatteryReport,
  ToolProcessInfo,
  KillProcessReport,
  CheckDiskReport,
} from "@/shared/types/system";

// =================================================================
// Tool metadata
// =================================================================
type ToolDef = {
  id: ToolId;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresAdmin: boolean;
  dangerous?: boolean;
  category: "system" | "files" | "security" | "network";
};

const TOOLS: ToolDef[] = [
  {
    id: "uninstall_app",
    name: "Gỡ cài đặt ứng dụng",
    description: "Danh sách ứng dụng đã cài, cho phép chạy uninstall",
    icon: AppWindow,
    requiresAdmin: false,
    category: "system",
  },
  {
    id: "disk_cleanup",
    name: "Dọn ổ đĩa",
    description: "Mở Disk Cleanup của Windows",
    icon: Trash2,
    requiresAdmin: false,
    category: "system",
  },
  {
    id: "defrag",
    name: "Defragment ổ đĩa",
    description: "Tối ưu hoặc phân mảnh lại ổ cứng (HDD)",
    icon: HardDrive,
    requiresAdmin: false,
    category: "system",
  },
  {
    id: "restore_point",
    name: "Tạo Restore Point",
    description: "Lưu trạng thái hệ thống để rollback",
    icon: Undo2,
    requiresAdmin: true,
    category: "security",
  },
  {
    id: "check_disk",
    name: "Kiểm tra ổ đĩa",
    description: "Chkdsk phát hiện lỗi filesystem",
    icon: CircleSlash,
    requiresAdmin: true,
    category: "system",
  },
  {
    id: "shred_file",
    name: "File Shredder",
    description: "Xóa vĩnh viễn file (ghi đè 3 lần + 1 zero)",
    icon: FileX2,
    requiresAdmin: false,
    dangerous: true,
    category: "security",
  },
  {
    id: "registry_clean",
    name: "Quét Registry",
    description: "Tìm App Paths / MuiCache trỏ tới file đã xóa",
    icon: Search,
    requiresAdmin: false,
    category: "security",
  },
  {
    id: "duplicate_finder",
    name: "Tìm file trùng lặp",
    description: "Hash MD5 tìm các file giống nhau",
    icon: Copy,
    requiresAdmin: false,
    category: "files",
  },
  {
    id: "large_file_finder",
    name: "Tìm file dung lượng lớn",
    description: "Liệt kê file lớn nhất trong thư mục",
    icon: Files,
    requiresAdmin: false,
    category: "files",
  },
  {
    id: "power_plan",
    name: "Power Plan",
    description: "Chuyển High performance / Balanced / Power saver",
    icon: Zap,
    requiresAdmin: false,
    category: "system",
  },
  {
    id: "network_reset",
    name: "Reset mạng",
    description: "Winsock reset, ipconfig flush/renew",
    icon: Network,
    requiresAdmin: true,
    category: "network",
  },
  {
    id: "flush_dns",
    name: "Flush DNS",
    description: "Xóa cache DNS resolver",
    icon: RefreshCw,
    requiresAdmin: false,
    category: "network",
  },
  {
    id: "battery_report",
    name: "Battery Report",
    description: "Tạo báo cáo pin (HTML) mở trong browser",
    icon: Battery,
    requiresAdmin: false,
    category: "system",
  },
  {
    id: "process_manager",
    name: "Process Manager",
    description: "Liệt kê process, kill PID, filter system",
    icon: Cpu,
    requiresAdmin: false,
    category: "system",
  },
];

// =================================================================
// Page
// =================================================================
export default function ToolsPage() {
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [filterCat, setFilterCat] = useState<"all" | "system" | "files" | "security" | "network">("all");

  const visibleTools = useMemo(
    () => (filterCat === "all" ? TOOLS : TOOLS.filter((t) => t.category === filterCat)),
    [filterCat]
  );

  return (
    <div className="space-y-4">
      <Card
        title="Tiện ích"
        subtitle={`${TOOLS.length} công cụ mini cho Windows`}
        action={
          <div className="flex gap-1 text-xs">
            {(["all", "system", "files", "security", "network"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setFilterCat(c)}
                className={
                  "rounded-lg px-3 py-1.5 transition-colors " +
                  (filterCat === c
                    ? "bg-brand/20 text-brand"
                    : "text-ink-muted hover:bg-white/5 hover:text-ink")
                }
              >
                {c === "all" ? "Tất cả" : labelOf(c)}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTools.map((tool) => (
            <ToolTile key={tool.id} tool={tool} onClick={() => setActiveTool(tool.id)} />
          ))}
        </div>
      </Card>

      {activeTool && (
        <ToolPanel toolId={activeTool} onClose={() => setActiveTool(null)} />
      )}
    </div>
  );
}

function labelOf(c: string) {
  switch (c) {
    case "system": return "Hệ thống";
    case "files": return "Tệp tin";
    case "security": return "Bảo mật";
    case "network": return "Mạng";
    default: return c;
  }
}

function ToolTile({ tool, onClick }: { tool: ToolDef; onClick: () => void }) {
  const Icon = tool.icon;
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-left transition-colors hover:border-brand/30 hover:bg-brand/[0.04]"
    >
      <div className="flex w-full items-start justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand/20">
          <Icon className="h-5 w-5" />
        </div>
        {tool.requiresAdmin && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
            Cần admin
          </span>
        )}
        {tool.dangerous && (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
            Nguy hiểm
          </span>
        )}
      </div>
      <div>
        <div className="text-sm font-medium text-ink">{tool.name}</div>
        <div className="mt-0.5 text-xs text-ink-muted">{tool.description}</div>
      </div>
    </button>
  );
}

// =================================================================
// Panel chung cho mọi tool - render tool-specific UI
// =================================================================
function ToolPanel({ toolId, onClose }: { toolId: ToolId; onClose: () => void }) {
  const tool = TOOLS.find((t) => t.id === toolId)!;
  const Icon = tool.icon;
  const [confirm, setConfirm] = useState(false);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand" />
          {tool.name}
        </span>
      }
      subtitle={tool.description}
      action={
        <Button variant="ghost" onClick={onClose} className="!p-2">
          <X className="h-4 w-4" />
        </Button>
      }
    >
      {tool.requiresAdmin && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Công cụ này có thể cần quyền admin. Nếu thất bại, hãy chạy lại app với Run as administrator.</span>
        </div>
      )}
      {tool.dangerous && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Hành động này KHÔNG THỂ khôi phục. File sẽ bị ghi đè và xóa vĩnh viễn.</span>
        </div>
      )}

      {toolId === "uninstall_app" && <UninstallAppTool />}
      {toolId === "disk_cleanup" && <DiskCleanupTool />}
      {toolId === "defrag" && <DefragTool />}
      {toolId === "shred_file" && <ShredFileTool onConfirm={() => setConfirm(true)} />}
      {toolId === "registry_clean" && <RegistryCleanTool />}
      {toolId === "duplicate_finder" && <DuplicateFinderTool />}
      {toolId === "large_file_finder" && <LargeFileTool />}
      {toolId === "restore_point" && <RestorePointTool />}
      {toolId === "power_plan" && <PowerPlanTool />}
      {toolId === "network_reset" && <NetworkResetTool />}
      {toolId === "flush_dns" && <FlushDnsTool />}
      {toolId === "battery_report" && <BatteryReportTool />}
      {toolId === "process_manager" && <ProcessManagerTool />}
      {toolId === "check_disk" && <CheckDiskTool />}

      {confirm && (
        <ConfirmDialog
          title={`Xác nhận ${tool.name}`}
          message="Bạn có chắc chắn muốn tiếp tục?"
          onConfirm={async () => {
            setConfirm(false);
          }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </Card>
  );
}

// =================================================================
// 1. Uninstall App
// =================================================================
function UninstallAppTool() {
  const [apps, setApps] = useState<InstalledAppForUninstall[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    invoke<InstalledAppForUninstall[]>("list_installed_apps")
      .then(setApps)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return apps;
    const q = search.toLowerCase();
    return apps.filter((a) => a.name.toLowerCase().includes(q));
  }, [apps, search]);

  const handleUninstall = async (app: InstalledAppForUninstall) => {
    if (!app.uninstallString) {
      setError(`${app.name} không có lệnh uninstall`);
      return;
    }
    if (!confirm(`Gỡ cài đặt "${app.name}"?\n\nLệnh sẽ được chạy: ${app.uninstallString}`)) {
      return;
    }
    setBusy(app.name);
    setError(null);
    try {
      const msg = await invoke<string>("uninstall_app", { uninstallString: app.uninstallString });
      setSuccess(msg);
      setApps((prev) => prev.filter((a) => a.name !== app.name));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={success} onClearError={() => setError(null)} onClearSuccess={() => setSuccess(null)} />
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
        <input
          type="text"
          placeholder="Tìm ứng dụng..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-white/5 bg-white/5 py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-brand/40"
        />
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang đọc registry...
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-bg-50 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-left">Tên</th>
                <th className="px-3 py-2 text-left">Nhà phát hành</th>
                <th className="px-3 py-2 text-right">Dung lượng</th>
                <th className="px-3 py-2 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((app, i) => (
                <tr key={i} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-ink">{app.name}</td>
                  <td className="px-3 py-2 text-ink-muted">{app.publisher || "-"}</td>
                  <td className="px-3 py-2 text-right text-ink-muted">
                    {app.estimatedSizeKb ? formatBytes(app.estimatedSizeKb * 1024) : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      onClick={() => handleUninstall(app)}
                      disabled={busy === app.name || !app.uninstallString}
                      loading={busy === app.name}
                      className="!text-xs"
                    >
                      Gỡ
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <div className="px-3 py-2 text-center text-xs text-ink-muted">
              Hiển thị 100/{filtered.length} kết quả
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =================================================================
// 2. Disk Cleanup
// =================================================================
function DiskCleanupTool() {
  const [drive, setDrive] = useState("C");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<DiskCleanupReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<DiskCleanupReport>("run_disk_cleanup", { drive });
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={null} onClearError={() => setError(null)} onClearSuccess={() => {}} />
      <div className="flex items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Ổ đĩa</label>
          <select
            value={drive}
            onChange={(e) => setDrive(e.target.value)}
            className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-ink outline-none"
          >
            {["C", "D", "E", "F"].map((d) => (
              <option key={d} value={d}>{d}:</option>
            ))}
          </select>
        </div>
        <Button onClick={run} loading={busy}>
          <PlayCircle className="mr-2 h-4 w-4" /> Mở Disk Cleanup
        </Button>
      </div>
      {report && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
          <div className="font-medium text-ink">{report.targetDrive}</div>
          <div className="text-ink-muted">{report.message}</div>
          <div className="mt-1 text-xs text-ink-subtle">Thời gian: {report.durationMs}ms</div>
        </div>
      )}
    </div>
  );
}

// =================================================================
// 3. Defrag
// =================================================================
function DefragTool() {
  const [drive, setDrive] = useState("C");
  const [optimize, setOptimize] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<DefragReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<DefragReport>("run_defrag", { drive, optimize });
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={null} onClearError={() => setError(null)} onClearSuccess={() => {}} />
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Ổ đĩa</label>
          <select value={drive} onChange={(e) => setDrive(e.target.value)} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-ink outline-none">
            {["C", "D", "E", "F"].map((d) => <option key={d} value={d}>{d}:</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} className="rounded" />
          Optimize (cho SSD)
        </label>
        <Button onClick={run} loading={busy}>
          <PlayCircle className="mr-2 h-4 w-4" /> Chạy defrag
        </Button>
      </div>
      {report && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink">{report.drive}</span>
            <span className={"rounded-full px-2 py-0.5 text-xs " + statusColor(report.status)}>
              {report.status}
            </span>
          </div>
          <div className="mt-1 text-ink-muted">{report.message}</div>
          <div className="mt-1 text-xs text-ink-subtle">Thời gian: {report.durationMs}ms</div>
        </div>
      )}
    </div>
  );
}

// =================================================================
// 4. File Shredder
// =================================================================
function ShredFileTool({ onConfirm }: { onConfirm: () => void }) {
  const [path, setPath] = useState("");
  const [passes, setPasses] = useState(3);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ShredReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!path) {
      setError("Nhập đường dẫn file cần xóa");
      return;
    }
    if (!confirm(`Xóa VĨNH VIỄN file:\n${path}\n\nFile sẽ bị ghi đè ${passes} lần rồi xóa. KHÔNG THỂ khôi phục!`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<ShredReport>("shred_file", { path, passes });
      setReport(r);
      setPath("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={null} onClearError={() => setError(null)} onClearSuccess={() => {}} />
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Đường dẫn file</label>
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="C:\Users\...\file.txt"
          className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-brand/40"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Số lần ghi đè (1-7, mặc định 3 = DoD 5220.22-M)</label>
        <input
          type="number"
          min={1}
          max={7}
          value={passes}
          onChange={(e) => setPasses(Number(e.target.value))}
          className="w-24 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-ink outline-none"
        />
      </div>
      <Button onClick={run} loading={busy} variant="danger">
        <FileX2 className="mr-2 h-4 w-4" /> Shred file
      </Button>
      {report && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
          <div className="font-medium text-ink">Mục tiêu: {report.target}</div>
          <div className="text-ink-muted">{report.message}</div>
          <div className="mt-1 text-xs text-ink-subtle">
            {report.passes} pass, {formatBytes(report.bytesWritten)} đã ghi, {report.durationMs}ms
          </div>
        </div>
      )}
    </div>
  );
}

// =================================================================
// 5. Registry Cleaner
// =================================================================
function RegistryCleanTool() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RegistryScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<RegistryScanReport>("scan_registry");
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={null} onClearError={() => setError(null)} onClearSuccess={() => {}} />
      <Button onClick={run} loading={busy}>
        <Search className="mr-2 h-4 w-4" /> Quét registry
      </Button>
      {report && (
        <div className="space-y-2">
          <div className="text-xs text-ink-muted">
            Đã quét {report.scannedKeys} key, tìm thấy {report.issues.length} vấn đề ({report.durationMs}ms)
          </div>
          {report.issues.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Registry sạch!
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-white/5">
              {report.issues.map((iss, i) => (
                <div key={i} className="border-b border-white/5 p-2 text-xs last:border-b-0">
                  <div className={"mb-1 inline-block rounded-full px-2 py-0.5 " + severityColor(iss.severity)}>
                    {iss.severity}
                  </div>
                  <div className="text-ink">{iss.issue}</div>
                  <div className="font-mono text-ink-subtle">{iss.hive}\{iss.key}</div>
                  {iss.value && <div className="text-ink-muted">{iss.value}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =================================================================
// 6. Duplicate Finder
// =================================================================
function DuplicateFinderTool() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<DuplicateScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!confirm("Quét sẽ chạy nhanh (chỉ hash 64KB đầu tiên) để demo. File > 100MB sẽ bị bỏ qua.")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<DuplicateScanReport>("find_duplicates", { roots: null, maxFiles: 5000 });
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={null} onClearError={() => setError(null)} onClearSuccess={() => {}} />
      <Button onClick={run} loading={busy}>
        <Copy className="mr-2 h-4 w-4" /> Quét file trùng
      </Button>
      {report && (
        <div className="space-y-2">
          <div className="text-xs text-ink-muted">
            Đã quét {report.scannedFiles} file, tìm thấy {report.groups.length} nhóm trùng
            (lãng phí ~{formatBytes(report.wastedBytes)})
          </div>
          {report.groups.length === 0 ? (
            <div className="text-sm text-emerald-300">Không tìm thấy file trùng.</div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {report.groups.slice(0, 20).map((g, i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-ink">{g.paths.length} bản sao - {formatBytes(g.sizeBytes)} mỗi file</span>
                  </div>
                  {g.paths.map((p, j) => (
                    <div key={j} className="font-mono text-ink-muted">{p}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =================================================================
// 7. Large File Finder
// =================================================================
function LargeFileTool() {
  const [root, setRoot] = useState("C:\\Users");
  const [minSize, setMinSize] = useState(100);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<LargeFileReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<LargeFileReport>("find_large_files", { root, minSizeMb: minSize, limit: 50 });
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={null} onClearError={() => setError(null)} onClearSuccess={() => {}} />
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-ink-muted">Thư mục gốc</label>
          <input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-ink outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Tối thiểu (MB)</label>
          <input
            type="number"
            value={minSize}
            onChange={(e) => setMinSize(Number(e.target.value))}
            className="w-24 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-ink outline-none"
          />
        </div>
        <Button onClick={run} loading={busy}>
          <Files className="mr-2 h-4 w-4" /> Quét
        </Button>
      </div>
      {report && (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-bg-50 text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-left">File</th>
                <th className="px-3 py-2 text-right">Dung lượng</th>
                <th className="px-3 py-2 text-right">Sửa đổi</th>
              </tr>
            </thead>
            <tbody>
              {report.entries.map((e, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="max-w-md truncate px-3 py-2 font-mono text-xs text-ink" title={e.path}>{e.path}</td>
                  <td className="px-3 py-2 text-right text-ink">{formatBytes(e.sizeBytes)}</td>
                  <td className="px-3 py-2 text-right text-ink-muted">{e.modifiedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =================================================================
// 8. Restore Point
// =================================================================
function RestorePointTool() {
  const [desc, setDesc] = useState("PC Manager Pro checkpoint");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RestorePointReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<RestorePointReport>("create_restore_point", { description: desc });
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={null} onClearError={() => setError(null)} onClearSuccess={() => {}} />
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Mô tả</label>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-ink outline-none"
        />
      </div>
      <Button onClick={run} loading={busy}>
        <Save className="mr-2 h-4 w-4" /> Tạo restore point
      </Button>
      {report && (
        <div className={"rounded-lg border p-3 text-sm " + (report.success ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : "border-amber-500/20 bg-amber-500/5 text-amber-300")}>
          {report.message}
        </div>
      )}
    </div>
  );
}

// =================================================================
// 9. Power Plan
// =================================================================
function PowerPlanTool() {
  const [plans, setPlans] = useState<PowerPlan[]>([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SetPowerPlanReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await invoke<PowerPlan[]>("list_power_plans");
      setPlans(p);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const setPlan = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<SetPowerPlanReport>("set_power_plan_tools", { plan: name });
      setReport(r);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={report?.success ? `Đã chuyển sang ${report.planName}` : null} onClearError={() => setError(null)} onClearSuccess={() => setReport(null)} />
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-ink">Power Plans</h4>
        <Button variant="ghost" onClick={refresh} loading={busy}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2">
        {plans.map((p) => (
          <div key={p.guid} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div>
              <div className="text-sm text-ink">{p.name}</div>
              <div className="font-mono text-xs text-ink-subtle">{p.guid}</div>
            </div>
            {p.isActive ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">Đang dùng</span>
            ) : (
              <Button variant="secondary" onClick={() => {
                const id = p.name.toLowerCase().includes("high") ? "high"
                  : p.name.toLowerCase().includes("balanced") ? "balanced"
                  : p.name.toLowerCase().includes("saver") || p.name.toLowerCase().includes("power") ? "power_saver"
                  : p.guid;
                setPlan(id);
              }}>Kích hoạt</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// =================================================================
// 10. Network Reset
// =================================================================
function NetworkResetTool() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<NetworkResetReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!confirm("Reset network sẽ chạy: netsh winsock reset, ip reset, ipconfig flush/release/renew. Cần restart máy.")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<NetworkResetReport>("reset_network");
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={null} onClearError={() => setError(null)} onClearSuccess={() => {}} />
      <Button onClick={run} loading={busy} variant="danger">
        <Network className="mr-2 h-4 w-4" /> Reset network
      </Button>
      {report && (
        <div className="space-y-2">
          <div className={"rounded-lg border p-3 text-sm " + (report.success ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : "border-amber-500/20 bg-amber-500/5 text-amber-300")}>
            {report.message}
          </div>
          {report.steps.map((s, i) => (
            <div key={i} className="rounded border border-white/5 p-2 text-xs">
              <div className="font-mono text-ink">{s.step}</div>
              <div className="mt-1 text-ink-muted">{s.output || "(no output)"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =================================================================
// 11. Flush DNS
// =================================================================
function FlushDnsTool() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      // repair.rs đã có command `flush_dns` (returns RepairReport)
      const r = await invoke<{ message: string }>("run_dism_check_health").catch(() => null);
      void r;
      // dùng command flush_dns từ repair module
      const out = await invoke<string>("flush_dns").catch((e) => {
        throw e;
      });
      setResult(out);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={result} onClearError={() => setError(null)} onClearSuccess={() => setResult(null)} />
      <Button onClick={run} loading={busy}>
        <RefreshCw className="mr-2 h-4 w-4" /> Flush DNS
      </Button>
    </div>
  );
}

// =================================================================
// 12. Battery Report
// =================================================================
function BatteryReportTool() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BatteryReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const outDir = await invoke<string | null>("get_app_data_dir").catch(() => "C:\\PCManagerPro");
      const r = await invoke<BatteryReport>("generate_battery_report", { outputDir: outDir || "C:\\PCManagerPro" });
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={null} onClearError={() => setError(null)} onClearSuccess={() => {}} />
      <Button onClick={run} loading={busy}>
        <Battery className="mr-2 h-4 w-4" /> Tạo battery report
      </Button>
      {report && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm">
          <div className="text-ink">{report.message}</div>
          {report.generated && (
            <div className="mt-1 font-mono text-xs text-ink-muted">{report.filePath} ({formatBytes(report.sizeBytes)})</div>
          )}
        </div>
      )}
    </div>
  );
}

// =================================================================
// 13. Process Manager
// =================================================================
function ProcessManagerTool() {
  const [procs, setProcs] = useState<ToolProcessInfo[]>([]);
  const [search, setSearch] = useState("");
  const [includeSystem, setIncludeSystem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<ToolProcessInfo[]>("list_tool_processes", { limit: 100, includeSystem });
      setProcs(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [includeSystem]);

  const kill = async (p: ToolProcessInfo) => {
    if (p.isSystem) {
      setError("Không thể kill system process");
      return;
    }
    if (!confirm(`Kill process ${p.name} (PID ${p.pid})?`)) return;
    try {
      const r = await invoke<KillProcessReport>("kill_tool_process", { pid: p.pid });
      if (r.success) {
        setSuccess(`Đã kill ${r.name} (${r.pid})`);
        setTimeout(() => refresh(), 500);
      } else {
        setError(r.message);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const filtered = useMemo(() => {
    if (!search) return procs;
    const q = search.toLowerCase();
    return procs.filter((p) => p.name.toLowerCase().includes(q) || p.pid.toString() === q);
  }, [procs, search]);

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={success} onClearError={() => setError(null)} onClearSuccess={() => setSuccess(null)} />
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc PID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/5 bg-white/5 py-2 pl-9 pr-3 text-sm text-ink outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" checked={includeSystem} onChange={(e) => setIncludeSystem(e.target.checked)} />
          System
        </label>
        <Button variant="ghost" onClick={refresh} loading={busy}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-96 overflow-y-auto rounded-lg border border-white/5">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-50 text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-3 py-2 text-right">PID</th>
              <th className="px-3 py-2 text-left">Tên</th>
              <th className="px-3 py-2 text-right">CPU %</th>
              <th className="px-3 py-2 text-right">RAM</th>
              <th className="px-3 py-2 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.pid} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-right font-mono text-xs text-ink-muted">{p.pid}</td>
                <td className="px-3 py-2 text-ink">{p.name}</td>
                <td className="px-3 py-2 text-right text-ink">{p.cpuPercent.toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-ink">{formatBytes(p.memBytes)}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" disabled={p.isSystem} onClick={() => kill(p)} className="!text-xs">
                    Kill
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =================================================================
// 14. Check Disk
// =================================================================
function CheckDiskTool() {
  const [drive, setDrive] = useState("C");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CheckDiskReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!confirm(`Chạy chkdsk ${drive}: ở chế độ read-only (không fix). Để thực sự fix, cần chkdsk /F /R và restart.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<CheckDiskReport>("check_disk", { drive });
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <BannerMessages error={error} success={null} onClearError={() => setError(null)} onClearSuccess={() => {}} />
      <div className="flex items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Ổ đĩa</label>
          <select value={drive} onChange={(e) => setDrive(e.target.value)} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-ink outline-none">
            {["C", "D", "E", "F"].map((d) => <option key={d} value={d}>{d}:</option>)}
          </select>
        </div>
        <Button onClick={run} loading={busy}>
          <CircleSlash className="mr-2 h-4 w-4" /> Quét ổ đĩa
        </Button>
      </div>
      {report && (
        <div className={"rounded-lg border p-3 text-sm " + (report.success ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : "border-amber-500/20 bg-amber-500/5 text-amber-300")}>
          <div className="font-medium">{report.drive}</div>
          <div>{report.message}</div>
          {report.needsReboot && <div className="mt-1 text-xs">⚠ Cần restart để fix</div>}
        </div>
      )}
    </div>
  );
}

// =================================================================
// Helpers
// =================================================================
function BannerMessages({ error, success, onClearError, onClearSuccess }: { error: string | null; success: string | null; onClearError: () => void; onClearSuccess: () => void }) {
  useEffect(() => {
    if (error) {
      const id = setTimeout(onClearError, 5000);
      return () => clearTimeout(id);
    }
  }, [error, onClearError]);
  useEffect(() => {
    if (success) {
      const id = setTimeout(onClearSuccess, 4000);
      return () => clearTimeout(id);
    }
  }, [success, onClearSuccess]);
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  if (success) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-300">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{success}</span>
      </div>
    );
  }
  return null;
}

function statusColor(s: string) {
  if (s === "ok") return "bg-emerald-500/10 text-emerald-300";
  if (s === "skipped") return "bg-sky-500/10 text-sky-300";
  return "bg-red-500/10 text-red-300";
}

function severityColor(s: string) {
  if (s === "error") return "bg-red-500/10 text-red-300";
  if (s === "warning") return "bg-amber-500/10 text-amber-300";
  return "bg-sky-500/10 text-sky-300";
}

function ConfirmDialog({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-xl border border-white/10 bg-bg-50 p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm text-ink-muted">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Hủy</Button>
          <Button variant="danger" onClick={onConfirm}>Xác nhận</Button>
        </div>
      </div>
    </div>
  );
}
