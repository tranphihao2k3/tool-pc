/**
 * StatDetailPanel — modal hiển thị chi tiết sâu cho 1 metric realtime.
 *
 * Mở bằng cách click vào chip trong `StatsBar`.
 * Đóng bằng: nút X, phím Escape, hoặc click vào backdrop.
 */
import { useEffect, useRef } from "react";
import { X, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProgressBar } from "@/shared/components/ProgressBar";
import { StatList } from "@/shared/components/StatList";
import { useTauriCommand } from "@/shared/components/ErrorState";
import {
  formatBytes,
  formatBytesPerSec,
  formatCpuClock,
  formatPercent,
} from "@/shared/lib/utils";
import type {
  CpuCore,
  DiskInfo,
  GpuInfo,
  NetworkAdapter,
  RamInfo,
  RealtimeStats,
} from "@/shared/types/system";
import type { StatKey } from "./StatsBar";

/** Route tương ứng để "mở trang chi tiết". */
const DETAIL_ROUTE: Record<StatKey, string> = {
  cpu: "/system/cpu",
  ram: "/system/ram",
  disk: "/system/disk",
  temp: "/system/cpu",
  gpu: "/system/gpu",
  net: "/system/network",
};

export function StatDetailPanel({
  statKey,
  stats,
  onClose,
}: {
  statKey: StatKey;
  stats: RealtimeStats;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape để đóng + focus vào nút đóng khi mở.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const goDetail = () => {
    onClose();
    navigate(DETAIL_ROUTE[statKey]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Chi tiết thông số"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-2xl p-0 shadow-card">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/5 p-5">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {TITLE[statKey]}
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {SUBTITLE[statKey]}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {statKey === "cpu" && <CpuDetail stats={stats} />}
          {statKey === "ram" && <RamDetail stats={stats} />}
          {statKey === "disk" && <DiskDetail stats={stats} />}
          {statKey === "temp" && <TempDetail stats={stats} />}
          {statKey === "gpu" && <GpuDetail stats={stats} />}
          {statKey === "net" && <NetDetail stats={stats} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/5 p-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={goDetail}
            className="btn-primary text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Mở trang {PAGE_NAME[statKey]}
          </button>
        </div>
      </div>
    </div>
  );
}

const TITLE: Record<StatKey, string> = {
  cpu: "Chi tiết CPU",
  ram: "Chi tiết RAM",
  disk: "Chi tiết Ổ đĩa",
  temp: "Chi tiết nhiệt độ",
  gpu: "Chi tiết GPU",
  net: "Chi tiết mạng",
};

const SUBTITLE: Record<StatKey, string> = {
  cpu: "Tải tổng, xung nhịp và tải từng core",
  ram: "Dung lượng đã dùng / khả dụng",
  disk: "Dung lượng ổ hệ thống và tốc độ I/O",
  temp: "Nhiệt độ CPU theo thời gian thực",
  gpu: "Tải GPU, VRAM và nhiệt độ",
  net: "Băng thông nhận / gửi",
};

const PAGE_NAME: Record<StatKey, string> = {
  cpu: "CPU",
  ram: "RAM",
  disk: "Ổ đĩa",
  temp: "CPU",
  gpu: "GPU",
  net: "Mạng",
};

// =================================================================
// CPU
// =================================================================

function CpuDetail({ stats }: { stats: RealtimeStats }) {
  const { data } = useTauriCommand<CpuCore>("get_cpu_info");

  const cores = stats.perCoreLoad ?? [];

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
          <span>Tải tổng</span>
          <span className="font-mono text-ink">{formatPercent(stats.cpuPercent)}</span>
        </div>
        <ProgressBar
          value={stats.cpuPercent}
          tone={stats.cpuPercent > 85 ? "danger" : stats.cpuPercent > 60 ? "warning" : "brand"}
        />
      </div>

      <StatList
        rows={[
          { label: "Xung nhịp hiện tại", value: formatCpuClock(stats.cpuFreqMhz) },
          {
            label: "Xung nhịp gốc",
            value: formatCpuClock(data?.baseClockMhz),
          },
          {
            label: "Cores / Threads",
            value: data ? `${data.cores} / ${data.threads}` : "—",
          },
          { label: "Tên CPU", value: data?.name ?? "—" },
          { label: "Socket", value: data?.socket || "—" },
          {
            label: "Cache L2 / L3",
            value: data ? `${data.l2CacheKb} KB / ${data.l3CacheKb} KB` : "—",
          },
        ]}
      />

      {cores.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-ink-muted">
            Tải từng core ({cores.length} luồng)
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
            {cores.map((v, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/5 bg-white/5 p-1.5"
                title={`Core ${i}: ${v.toFixed(1)}%`}
              >
                <div className="text-[9px] text-ink-subtle">C{i}</div>
                <div className="font-mono text-[11px] text-ink">{v.toFixed(0)}%</div>
                <ProgressBar
                  value={v}
                  className="mt-1 h-0.5"
                  tone={v > 80 ? "danger" : v > 50 ? "warning" : "brand"}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =================================================================
// RAM
// =================================================================

function RamDetail({ stats }: { stats: RealtimeStats }) {
  const { data } = useTauriCommand<RamInfo>("get_ram_info");

  const total = stats.ramTotalBytes || data?.totalBytes || 0;
  const used = stats.ramUsedBytes || data?.usedBytes || 0;
  const available = data?.availableBytes ?? Math.max(0, total - used);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
          <span>Đang dùng</span>
          <span className="font-mono text-ink">
            {formatBytes(used)} / {formatBytes(total)}
          </span>
        </div>
        <ProgressBar
          value={stats.ramPercent}
          tone={stats.ramPercent > 90 ? "danger" : stats.ramPercent > 75 ? "warning" : "accent"}
        />
      </div>

      <StatList
        rows={[
          { label: "Tổng", value: formatBytes(total) },
          { label: "Đã dùng", value: formatBytes(used) },
          { label: "Khả dụng", value: formatBytes(available) },
          { label: "Cached", value: formatBytes(data?.cachedBytes ?? 0) },
          {
            label: "Swap",
            value: data
              ? `${formatBytes(data.swapUsedBytes)} / ${formatBytes(data.swapTotalBytes)}`
              : "—",
          },
          {
            label: "Số thanh",
            value: data ? `${data.usedSlots}/${data.totalSlots}` : "—",
          },
        ]}
      />
    </div>
  );
}

// =================================================================
// Disk
// =================================================================

function DiskDetail({ stats }: { stats: RealtimeStats }) {
  const { data } = useTauriCommand<DiskInfo>("get_disk_info");

  const volumes = data?.logical ?? [];
  const physical = data?.physical ?? [];
  const total = stats.diskTotalBytes || volumes[0]?.sizeBytes || 0;
  const used = stats.diskUsedBytes || 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
          <span>
            Ổ hệ thống {stats.diskSystemDrive || "C:"}
          </span>
          <span className="font-mono text-ink">
            {used > 0 ? `${formatBytes(used)} / ${formatBytes(total)}` : "—"}
          </span>
        </div>
        <ProgressBar
          value={stats.diskPercent}
          tone={
            stats.diskPercent > 90
              ? "danger"
              : stats.diskPercent > 75
              ? "warning"
              : "success"
          }
        />
      </div>

      <StatList
        rows={[
          { label: "Đang dùng", value: formatPercent(stats.diskPercent) },
          { label: "Tốc độ đọc", value: formatBytesPerSec(stats.diskReadBps) },
          { label: "Tốc độ ghi", value: formatBytesPerSec(stats.diskWriteBps) },
          { label: "Số ổ vật lý", value: String(physical.length) },
        ]}
      />

      {volumes.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-ink-muted">Các phân vùng</div>
          <div className="space-y-2">
            {volumes.map((v) => {
              const usedBytes = v.sizeBytes - v.freeBytes;
              const pct = v.sizeBytes > 0 ? (usedBytes / v.sizeBytes) * 100 : 0;
              return (
                <div key={v.deviceId} className="rounded-xl border border-white/5 bg-white/5 p-3">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">
                      {v.deviceId} {v.label && `• ${v.label}`}
                    </span>
                    <span className="font-mono text-ink-muted">
                      {formatBytes(usedBytes)} / {formatBytes(v.sizeBytes)}
                    </span>
                  </div>
                  <ProgressBar
                    value={pct}
                    className="h-1"
                    tone={pct > 90 ? "danger" : pct > 75 ? "warning" : "success"}
                  />
                  <div className="mt-1 text-[10px] text-ink-subtle">
                    {v.fileSystem} • {pct.toFixed(1)}% đã dùng
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// =================================================================
// Nhiệt độ
// =================================================================

function TempDetail({ stats }: { stats: RealtimeStats }) {
  const temp = stats.cpuTempC;
  const available = temp != null;

  const tone =
    !available
      ? "brand"
      : temp >= 90
      ? "danger"
      : temp >= 75
      ? "warning"
      : "success";

  const status = !available
    ? "Không đọc được"
    : temp >= 90
    ? "Quá nóng — nên tản nhiệt"
    : temp >= 75
    ? "Nóng — theo dõi"
    : temp >= 50
    ? "Bình thường"
    : "Mát";

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
          <span>Nhiệt độ CPU</span>
          <span className="font-mono text-ink">
            {available ? `${temp.toFixed(1)}°C` : "—"}
          </span>
        </div>
        <ProgressBar value={available ? (temp / 100) * 100 : 0} tone={tone} />
      </div>

      <StatList
        rows={[
          { label: "Trạng thái", value: status },
          { label: "Nguồn", value: "MSAcpi_ThermalZoneTemperature (WMI)" },
          {
            label: "Ngưỡng cảnh báo",
            value: "75°C (cảnh báo) • 90°C (nguy hiểm)",
          },
          { label: "Tải CPU", value: formatPercent(stats.cpuPercent) },
        ]}
      />

      {!available && (
        <p className="rounded-xl border border-warning/20 bg-warning/5 p-3 text-xs text-warning">
          Máy này không expose thermal zone qua WMI (thường gặp với laptop/VM).
          Nhiệt độ CPU sẽ hiện "—" cho tới khi phần cứng hỗ trợ.
        </p>
      )}
    </div>
  );
}

// =================================================================
// GPU
// =================================================================

function GpuDetail({ stats }: { stats: RealtimeStats }) {
  const { data } = useTauriCommand<GpuInfo[]>("get_gpu_info");

  const gpus = data ?? [];
  const primary = gpus.find((g) => g.isDiscrete) ?? gpus[0];

  const vramTotal = stats.gpuVramTotalBytes ?? primary?.vramBytes ?? null;
  const vramUsed = stats.gpuVramUsedBytes;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
          <span>Tải GPU</span>
          <span className="font-mono text-ink">
            {stats.gpuPercent != null ? `${stats.gpuPercent.toFixed(0)}%` : "—"}
          </span>
        </div>
        <ProgressBar value={stats.gpuPercent ?? 0} tone="brand" />
      </div>

      <StatList
        rows={[
          { label: "Tên GPU", value: stats.gpuName ?? primary?.name ?? "—" },
          { label: "Nhiệt độ", value: stats.gpuTempC != null ? `${stats.gpuTempC}°C` : "—"},
          {
            label: "VRAM",
            value: vramTotal
              ? vramUsed != null
                ? `${formatBytes(vramUsed)} / ${formatBytes(vramTotal)}`
                : formatBytes(vramTotal)
              : "—",
          },
          { label: "Driver", value: primary?.driverVersion || "—" },
          { label: "Độ phân giải", value: primary?.currentResolution ?? "—" },
          {
            label: "Loại",
            value: primary
              ? primary.isDiscrete
                ? "Discrete (rời)"
                : "Integrated (onboard)"
              : "—",
          },
        ]}
      />

      {gpus.length > 1 && (
        <div>
          <div className="mb-2 text-xs font-medium text-ink-muted">
            Tất cả card ({gpus.length})
          </div>
          <div className="space-y-1.5">
            {gpus.map((g, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs"
              >
                <span className="truncate text-ink">{g.name}</span>
                <span className="shrink-0 font-mono text-ink-muted">
                  {formatBytes(g.vramBytes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =================================================================
// Mạng
// =================================================================

function NetDetail({ stats }: { stats: RealtimeStats }) {
  const { data } = useTauriCommand<NetworkAdapter[]>("get_network_info");

  const adapters = data ?? [];
  const connected = adapters.filter((a) => a.isConnected);

  return (
    <div className="space-y-4">
      <StatList
        rows={[
          {
            label: "Tổng băng thông",
            value: formatBytesPerSec(stats.netRxBps + stats.netTxBps),
          },
          { label: "Đang nhận (↓)", value: formatBytesPerSec(stats.netRxBps) },
          { label: "Đang gửi (↑)", value: formatBytesPerSec(stats.netTxBps) },
          {
            label: "Adapter đang kết nối",
            value: connected.length > 0 ? connected[0].name : "Không có",
          },
        ]}
      />

      {adapters.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-ink-muted">
            Tất cả adapter ({adapters.length})
          </div>
          <div className="space-y-1.5">
            {adapters.map((a, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/5 bg-white/5 px-3 py-2"
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate font-medium text-ink">{a.name}</span>
                  {a.isConnected ? (
                    <span className="pill-success shrink-0 text-[10px]">Đang kết nối</span>
                  ) : (
                    <span className="pill-warning shrink-0 text-[10px]">Mất kết nối</span>
                  )}
                </div>
                <div className="text-[10px] text-ink-subtle">
                  {a.macAddress || "—"} •{" "}
                  {a.ipv4.length > 0 ? a.ipv4.join(", ") : "chưa có IPv4"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
