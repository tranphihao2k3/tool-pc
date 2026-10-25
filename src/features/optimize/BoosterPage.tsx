import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Zap, Power, Cpu, X, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { ProgressBar } from "@/shared/components/ProgressBar";
import { StatList } from "@/shared/components/StatList";
import { useTauriCommand, ErrorState } from "@/shared/components/ErrorState";
import { formatBytes, formatPercent } from "@/shared/lib/utils";
import type {
  TopProcess,
  PowerPlanInfo,
  BoostReport,
  RealtimeStats,
} from "@/shared/types/system";

const mockTopProcs: TopProcess[] = [
  { pid: 1234, name: "chrome.exe", cpuPercent: 4.2, memBytes: 820 * 1024 * 1024, diskReadBytes: 0, diskWriteBytes: 0, status: "Run" },
  { pid: 2345, name: "Code.exe", cpuPercent: 1.8, memBytes: 612 * 1024 * 1024, diskReadBytes: 0, diskWriteBytes: 0, status: "Run" },
  { pid: 3456, name: "Discord.exe", cpuPercent: 0.6, memBytes: 384 * 1024 * 1024, diskReadBytes: 0, diskWriteBytes: 0, status: "Run" },
  { pid: 4567, name: "explorer.exe", cpuPercent: 0.3, memBytes: 192 * 1024 * 1024, diskReadBytes: 0, diskWriteBytes: 0, status: "Run" },
];

const mockPowerPlan: PowerPlanInfo = {
  plan: "balanced",
  guid: "381b4222-f694-41f0-9685-ff5bb260df2e",
  active: true,
};

const mockRealtime: RealtimeStats = {
  cpuPercent: 23,
  ramPercent: 52,
  ramUsedBytes: 8.2 * 1024 ** 3,
  ramTotalBytes: 16 * 1024 ** 3,
  gpuPercent: 12,
  netRxBps: 0,
  netTxBps: 0,
  diskReadBps: 0,
  diskWriteBps: 0,
  cpuTempC: 58,
  timestampMs: Date.now(),
  diskPercent: 42,
  diskUsedBytes: 210 * 1024 ** 3,
  diskTotalBytes: 500 * 1024 ** 3,
  diskSystemDrive: "C:",
  cpuFreqMhz: 4200,
  perCoreLoad: [],
  gpuName: "NVIDIA GeForce RTX 4060",
  gpuTempC: 62,
  gpuVramUsedBytes: 1024 * 1024 ** 2,
  gpuVramTotalBytes: 8 * 1024 ** 3,
};

const POWER_PLANS = [
  { id: "high", label: "High performance", desc: "Hiệu năng tối đa, tiêu thụ điện cao hơn" },
  { id: "balanced", label: "Balanced", desc: "Cân bằng giữa hiệu năng và tiết kiệm" },
  { id: "power_saver", label: "Power saver", desc: "Tiết kiệm pin, giảm hiệu năng" },
] as const;

export default function BoosterPage() {
  const { t } = useTranslation();
  const topQ = useTauriCommand<TopProcess[]>("get_top_processes", { limit: 15 }, { mock: mockTopProcs });
  const powerQ = useTauriCommand<PowerPlanInfo>("get_active_power_plan", undefined, { mock: mockPowerPlan });
  const realtimeQ = useTauriCommand<RealtimeStats>("get_realtime_stats", undefined, { mock: mockRealtime });

  const [busy, setBusy] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<BoostReport | null>(null);
  const [confirmKill, setConfirmKill] = useState<TopProcess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-refresh top processes mỗi 5s
  useEffect(() => {
    const id = setInterval(() => topQ.refetch(), 5000);
    return () => clearInterval(id);
  }, [topQ.refetch]);

  // Auto-clear success sau 3s
  useEffect(() => {
    if (success) {
      const id = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(id);
    }
  }, [success]);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  const handleBoostNow = async () => {
    setBusy("boost");
    setError(null);
    try {
      const report = await invoke<BoostReport>("boost_now");
      setLastReport(report);
      setSuccess(report.message);
      topQ.refetch();
      realtimeQ.refetch();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleKill = async (proc: TopProcess) => {
    setBusy(`kill-${proc.pid}`);
    setError(null);
    try {
      await invoke<BoostReport>("kill_process", { pid: proc.pid });
      setSuccess(`Đã kết thúc ${proc.name}`);
      setConfirmKill(null);
      topQ.refetch();
      realtimeQ.refetch();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleSetPlan = async (plan: string) => {
    setBusy(`plan-${plan}`);
    setError(null);
    try {
      await invoke<PowerPlanInfo>("set_power_plan", { plan });
      setSuccess(`Đã chuyển sang ${plan}`);
      powerQ.refetch();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (topQ.error && !topQ.data)
    return <ErrorState error={topQ.error} onRetry={topQ.refetch} title="Không tải được danh sách process" />;

  const ram = realtimeQ.data;
  const cpu = realtimeQ.data;
  const currentPlan = powerQ.data?.plan ?? "unknown";

  return (
    <div className="space-y-6">
      {/* Toast thông báo */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Boost now card */}
        <Card
          title="Tăng tốc tức thì"
          subtitle="Tối ưu RAM + Power plan"
          action={
            <Button
              variant="primary"
              loading={busy === "boost"}
              onClick={handleBoostNow}
            >
              <Zap className="h-4 w-4" /> Boost ngay
            </Button>
          }
        >
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                <span>RAM đang dùng</span>
                <span>{formatPercent(ram?.ramPercent)}</span>
              </div>
              <ProgressBar
                value={ram?.ramPercent ?? 0}
                tone={
                  (ram?.ramPercent ?? 0) > 85
                    ? "danger"
                    : (ram?.ramPercent ?? 0) > 65
                    ? "warning"
                    : "success"
                }
              />
              <div className="mt-1 text-xs text-ink-subtle">
                {formatBytes(ram?.ramUsedBytes)} / {formatBytes((ram?.ramUsedBytes ?? 0) / ((ram?.ramPercent ?? 1) / 100))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                <span>CPU</span>
                <span>{formatPercent(cpu?.cpuPercent)}</span>
              </div>
              <ProgressBar
                value={cpu?.cpuPercent ?? 0}
                tone={
                  (cpu?.cpuPercent ?? 0) > 85
                    ? "danger"
                    : (cpu?.cpuPercent ?? 0) > 65
                    ? "warning"
                    : "brand"
                }
              />
            </div>
            {lastReport && (
              <div className="rounded-md border border-white/5 bg-white/[0.02] p-3 text-xs">
                <div className="font-medium text-ink">{lastReport.action}</div>
                <div className="mt-1 text-ink-muted">{lastReport.message}</div>
                {lastReport.freedBytes > 0 && (
                  <div className="mt-1 text-success">
                    Giải phóng: {formatBytes(lastReport.freedBytes)}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Power plan */}
        <Card title="Power Plan" subtitle="Chế độ năng lượng Windows">
          <div className="space-y-2">
            {POWER_PLANS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSetPlan(p.id)}
                disabled={busy !== null}
                className={`w-full rounded-md border p-3 text-left transition ${
                  currentPlan === p.id
                    ? "border-brand bg-brand/10"
                    : "border-white/5 hover:border-white/10 hover:bg-white/[0.02]"
                } disabled:opacity-50`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Power className="h-4 w-4 text-ink-muted" />
                    <span className="text-sm font-medium text-ink">{p.label}</span>
                  </div>
                  {currentPlan === p.id && (
                    <span className="pill-success text-[10px]">Hiện tại</span>
                  )}
                  {busy === `plan-${p.id}` && (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-muted">{p.desc}</p>
              </button>
            ))}
          </div>
        </Card>

        {/* Realtime stats */}
        <Card title="Realtime" subtitle="Tải hiện tại">
          <StatList
            rows={[
              { label: "CPU", value: formatPercent(cpu?.cpuPercent), hint: cpu?.cpuTempC ? `${cpu.cpuTempC}°C` : undefined },
              { label: "RAM", value: formatPercent(ram?.ramPercent), hint: formatBytes(ram?.ramUsedBytes) },
              { label: "GPU", value: ram?.gpuPercent != null ? formatPercent(ram.gpuPercent) : "—" },
              {
                label: "Process",
                value: `${topQ.data?.length ?? 0} processes`,
              },
            ]}
          />
        </Card>
      </div>

      {/* Top processes table */}
      <Card
        title="Top processes theo RAM"
        subtitle={`${topQ.data?.length ?? 0} process đang chạy · auto-refresh 5s`}
        action={
          <Button variant="secondary" onClick={topQ.refetch} loading={topQ.loading}>
            <RefreshCw className="h-4 w-4" /> Làm mới
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs text-ink-muted">
                <th className="py-2 pr-3">PID</th>
                <th className="py-2 pr-3">Tên</th>
                <th className="py-2 pr-3 text-right">CPU</th>
                <th className="py-2 pr-3 text-right">RAM</th>
                <th className="py-2 pr-3">Trạng thái</th>
                <th className="py-2 pr-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {(topQ.data ?? []).map((p) => (
                <tr key={p.pid} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="py-2 pr-3 font-mono text-xs text-ink-subtle">{p.pid}</td>
                  <td className="py-2 pr-3 font-medium text-ink">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-3 w-3 text-ink-muted" />
                      {p.name}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right text-ink-muted">{formatPercent(p.cpuPercent)}</td>
                  <td className="py-2 pr-3 text-right text-ink">{formatBytes(p.memBytes)}</td>
                  <td className="py-2 pr-3 text-xs text-ink-muted">{p.status}</td>
                  <td className="py-2 pr-3 text-right">
                    {confirmKill?.pid === p.pid ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="danger"
                          loading={busy === `kill-${p.pid}`}
                          onClick={() => handleKill(p)}
                          className="px-2 py-1 text-xs"
                        >
                          Xác nhận
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setConfirmKill(null)}
                          className="px-2 py-1 text-xs"
                        >
                          Hủy
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => setConfirmKill(p)}
                        disabled={busy !== null}
                        className="px-2 py-1 text-xs text-danger hover:bg-danger/10"
                      >
                        <X className="h-3 w-3" /> Kill
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {topQ.data?.length === 0 && (
            <div className="py-8 text-center text-sm text-ink-muted">Không có process nào</div>
          )}
        </div>
      </Card>
    </div>
  );
}
