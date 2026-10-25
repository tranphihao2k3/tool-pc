/**
 * StatsBar — thanh thông số gọn gộp tất cả metric realtime vào 1 dải ngang.
 *
 * Thiết kế (Task 13):
 * - 1 hàng duy nhất, mỗi metric là 1 "chip" nhỏ: icon + label + giá trị + bar.
 * - Click vào chip → mở `StatDetailPanel` xem chi tiết sâu của metric đó.
 * - Không dùng 1 card to cho mỗi metric (tốn không gian, phải scroll).
 */
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Thermometer,
  MonitorPlay,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { ProgressBar } from "@/shared/components/ProgressBar";
import { cn } from "@/shared/lib/utils";
import { formatBytesPerSec, formatCpuClock } from "@/shared/lib/utils";
import type { RealtimeStats } from "@/shared/types/system";

export type StatKey = "cpu" | "ram" | "disk" | "temp" | "gpu" | "net";

export interface Metric {
  key: StatKey;
  icon: LucideIcon;
  label: string;
  /** Giá trị chính hiển thị trên chip (đã format sẵn). */
  value: string;
  /** Phần trăm để vẽ bar (0-100). */
  pct: number;
  /** Màu tone của bar. */
  tone: "brand" | "accent" | "success" | "warning" | "danger";
  /** Dữ liệu phụ hiển thị nhỏ dưới label (vd "3.80 GHz"). */
  hint?: string;
  /** Có dữ liệu thật hay không (false → hiển thị "—"). */
  available: boolean;
}

/**
 * Chuyển raw stats → danh sách metric đã format.
 * Tách riêng khỏi component để test dễ và tái dùng cho panel chi tiết.
 */
export function buildMetrics(stats: RealtimeStats): Metric[] {
  const netTotal = stats.netRxBps + stats.netTxBps;

  // Local const để TS narrow được (alias của property không narrow).
  const cpuTemp = stats.cpuTempC;
  const gpuPercent = stats.gpuPercent;

  const tempAvailable = cpuTemp != null;
  const tempTone: Metric["tone"] =
    cpuTemp == null
      ? "brand"
      : cpuTemp >= 90
      ? "danger"
      : cpuTemp >= 75
      ? "warning"
      : "success";

  const gpuAvailable = gpuPercent != null;
  const diskAvailable = stats.diskTotalBytes > 0;

  return [
    {
      key: "cpu",
      icon: Cpu,
      label: "CPU",
      value: `${stats.cpuPercent.toFixed(0)}%`,
      pct: stats.cpuPercent,
      tone:
        stats.cpuPercent > 85 ? "danger" : stats.cpuPercent > 60 ? "warning" : "brand",
      hint: formatCpuClock(stats.cpuFreqMhz),
      available: true,
    },
    {
      key: "ram",
      icon: MemoryStick,
      label: "RAM",
      value: `${stats.ramPercent.toFixed(0)}%`,
      pct: stats.ramPercent,
      tone:
        stats.ramPercent > 90 ? "danger" : stats.ramPercent > 75 ? "warning" : "accent",
      hint:
        stats.ramTotalBytes > 0
          ? `${(stats.ramUsedBytes / 1024 ** 3).toFixed(1)}/${(
              stats.ramTotalBytes / 1024 ** 3
            ).toFixed(1)} GB`
          : undefined,
      available: stats.ramTotalBytes > 0,
    },
    {
      key: "disk",
      icon: HardDrive,
      label: `Disk ${stats.diskSystemDrive || ""}`.trim(),
      value: diskAvailable ? `${stats.diskPercent.toFixed(0)}%` : "—",
      pct: diskAvailable ? stats.diskPercent : 0,
      tone:
        stats.diskPercent > 90
          ? "danger"
          : stats.diskPercent > 75
          ? "warning"
          : "success",
      hint: diskAvailable
        ? `${(stats.diskUsedBytes / 1024 ** 3).toFixed(0)}/${(
            stats.diskTotalBytes / 1024 ** 3
          ).toFixed(0)} GB`
        : undefined,
      available: diskAvailable,
    },
    {
      key: "temp",
      icon: Thermometer,
      label: "Nhiệt độ",
      value: tempAvailable ? `${cpuTemp.toFixed(0)}°C` : "—",
      pct: tempAvailable ? Math.min(100, (cpuTemp / 100) * 100) : 0,
      tone: tempTone,
      hint: tempAvailable ? "CPU" : "Không đọc được",
      available: tempAvailable,
    },
    {
      key: "gpu",
      icon: MonitorPlay,
      label: "GPU",
      value: gpuAvailable ? `${gpuPercent.toFixed(0)}%` : "—",
      pct: stats.gpuPercent ?? 0,
      tone: (stats.gpuPercent ?? 0) > 85 ? "danger" : "brand",
      hint: stats.gpuName ?? "Không đọc được",
      available: gpuAvailable,
    },
    {
      key: "net",
      icon: Wifi,
      label: "Mạng",
      value: netTotal > 0 ? formatBytesPerSec(netTotal) : "—",
      // Băng thông không có "phần trăm" → dùng log scale để vẽ bar cho có cảm giác.
      pct: Math.min(100, (Math.log10(Math.max(1, netTotal)) / 8) * 100),
      tone: "accent",
      hint:
        netTotal > 0
          ? `↓${formatBytesPerSec(stats.netRxBps)} ↑${formatBytesPerSec(
              stats.netTxBps
            )}`
          : "Không có traffic",
      available: true,
    },
  ];
}

export function StatsBar({
  stats,
  active,
  onSelect,
}: {
  stats: RealtimeStats;
  active: StatKey | null;
  onSelect: (key: StatKey) => void;
}) {
  const metrics = buildMetrics(stats);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-white/5 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <MetricChip
            key={m.key}
            metric={m}
            active={active === m.key}
            onSelect={() => onSelect(m.key)}
          />
        ))}
      </div>
    </div>
  );
}

function MetricChip({
  metric,
  active,
  onSelect,
}: {
  metric: Metric;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = metric.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${metric.label}: ${metric.value}. Xem chi tiết`}
      aria-expanded={active}
      title="Click để xem chi tiết"
      className={cn(
        "group relative flex flex-col gap-1.5 p-3 text-left transition-colors",
        "hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        active && "bg-white/[0.06]"
      )}
    >
      {/* Chỉ báo active */}
      {active && (
        <span
          className="absolute inset-x-0 top-0 h-0.5 bg-brand-gradient"
          aria-hidden
        />
      )}

      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
          {metric.label}
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-mono text-base font-semibold tabular-nums",
            metric.available ? "text-ink" : "text-ink-subtle"
          )}
        >
          {metric.value}
        </span>
      </div>

      <ProgressBar value={metric.pct} tone={metric.tone} className="h-1" />

      {metric.hint && (
        <div className="truncate text-[10px] text-ink-subtle">{metric.hint}</div>
      )}
    </button>
  );
}
