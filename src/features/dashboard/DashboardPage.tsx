import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/Card";
import {
  Sparkles,
  Zap,
  Wrench,
  Shield,
  Activity,
  HardDrive,
  FileSearch,
  Cpu,
} from "lucide-react";
import { useRealtimeStats } from "./useRealtimeStats";
import { StatsBar, type StatKey } from "./StatsBar";
import { StatDetailPanel } from "./StatDetailPanel";

const HISTORY_LEN = 30;

export default function DashboardPage() {
  const navigate = useNavigate();
  const stats = useRealtimeStats();
  const [cpuHistory, setCpuHistory] = useState<number[]>(() =>
    Array(HISTORY_LEN).fill(0)
  );
  const [ramHistory, setRamHistory] = useState<number[]>(() =>
    Array(HISTORY_LEN).fill(0)
  );
  const lastTs = useRef(0);

  /** Metric đang mở chi tiết (null = đóng). */
  const [detail, setDetail] = useState<StatKey | null>(null);

  // Mỗi tick mới (timestampMs khác lần trước) → push vào history
  useEffect(() => {
    if (stats.timestampMs > 0 && stats.timestampMs !== lastTs.current) {
      lastTs.current = stats.timestampMs;
      setCpuHistory((h) => [...h.slice(1), stats.cpuPercent]);
      setRamHistory((h) => [...h.slice(1), stats.ramPercent]);
    }
  }, [stats.timestampMs, stats.cpuPercent, stats.ramPercent]);

  return (
    <div className="space-y-6">
      {/*
        Thanh thông số gọn — gộp 6 metric vào 1 dải ngang.
        Click vào 1 chip để mở panel chi tiết.
      */}
      <StatsBar
        stats={stats}
        active={detail}
        onSelect={(k) => setDetail((cur) => (cur === k ? null : k))}
      />

      {/* Charts — chỉ 2 cái, đặt cạnh nhau cho gọn */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="CPU 30 giây qua" subtitle="Realtime load">
          <Sparkline data={cpuHistory} />
        </Card>
        <Card title="RAM 30 giây qua" subtitle="Realtime usage">
          <Sparkline data={ramHistory} color="#22D3EE" />
        </Card>
      </div>

      <Card title="Lối tắt nhanh" subtitle="Truy cập nhanh các chức năng">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Shortcut
            icon={Sparkles}
            title="Dọn rác"
            desc="Giải phóng dung lượng"
            onClick={() => navigate("/optimize/cleaner")}
          />
          <Shortcut
            icon={Zap}
            title="Tăng tốc"
            desc="Tắt service không cần"
            onClick={() => navigate("/optimize/booster")}
          />
          <Shortcut
            icon={Wrench}
            title="Sửa lỗi"
            desc="SFC + DISM"
            onClick={() => navigate("/optimize/repair")}
          />
          <Shortcut
            icon={Shield}
            title="Quét virus"
            desc="Defender scan"
            onClick={() => navigate("/security")}
          />
          <Shortcut
            icon={Activity}
            title="Màn hình"
            desc="Tổng quan PC"
            onClick={() => navigate("/system")}
          />
          <Shortcut
            icon={HardDrive}
            title="Ổ đĩa"
            desc="Phân vùng & dung lượng"
            onClick={() => navigate("/system/disk")}
          />
          <Shortcut
            icon={FileSearch}
            title="Phần mềm"
            desc="Danh sách đã cài"
            onClick={() => navigate("/system/software")}
          />
          <Shortcut
            icon={Cpu}
            title="Khởi động"
            desc="Quản lý startup"
            onClick={() => navigate("/system/startup")}
          />
        </div>
      </Card>

      {/* Panel chi tiết — chỉ mount khi có metric được chọn */}
      {detail && (
        <StatDetailPanel
          statKey={detail}
          stats={stats}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function Sparkline({
  data,
  color = "#7C5CFF",
}: {
  data: number[];
  color?: string;
}) {
  if (data.length === 0) return null;
  const max = 100;
  const w = 100;
  const h = 30;
  const stepX = w / Math.max(1, data.length - 1);
  const points = data
    .map(
      (v, i) =>
        `${(i * stepX).toFixed(2)},${(h - (Math.max(0, Math.min(100, v)) / max) * h).toFixed(2)}`
    )
    .join(" ");
  const id = `spark-${color.replace("#", "")}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-24 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
      <polygon fill={`url(#${id})`} points={`0,${h} ${points} ${w},${h}`} />
    </svg>
  );
}

function Shortcut({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-white/5 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
    >
      <Icon className="mb-1 h-4 w-4 text-brand-200" />
      <div className="text-sm font-medium text-ink">{title}</div>
      <div className="text-xs text-ink-muted">{desc}</div>
    </button>
  );
}
