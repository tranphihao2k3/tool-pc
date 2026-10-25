import { useTauriCommand } from "@/shared/components/ErrorState";
import { Card } from "@/shared/components/Card";
import { StatList } from "@/shared/components/StatList";
import { ProgressBar } from "@/shared/components/ProgressBar";
import { formatMHz, formatPercent } from "@/shared/lib/utils";
import { Cpu } from "lucide-react";
import type { CpuCore } from "@/shared/types/system";

const mockCpu: CpuCore = {
  name: "AMD Ryzen 7 5800X 8-Core Processor",
  manufacturer: "AuthenticAMD",
  cores: 8,
  threads: 16,
  baseClockMhz: 3800,
  currentClockMhz: 4250,
  l2CacheKb: 4096,
  l3CacheKb: 32768,
  socket: "AM4",
  architecture: "x64",
  processorId: "Family 25 Model 33 Stepping 0",
  family: "25",
  stepping: "0",
  loadPercent: 23.4,
  perCoreLoad: [12, 18, 22, 30, 15, 25, 28, 20, 14, 22, 31, 17, 26, 23, 19, 28],
  temperatureC: null,
};

export default function CpuPage() {
  const { data, error, loading, refetch } = useTauriCommand<CpuCore>(
    "get_cpu_info",
    undefined,
    { mock: mockCpu }
  );

  if (loading && !data) {
    return <Card><div className="py-8 text-center text-ink-muted">Đang tải...</div></Card>;
  }
  if (error) {
    return <Card><div className="py-8 text-center text-danger">{error}</div></Card>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Card
        title="CPU"
        subtitle={data.name}
        action={<Cpu className="h-5 w-5 text-brand-200" />}
      >
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
            <span>Tải CPU</span>
            <span className="font-mono text-ink">{formatPercent(data.loadPercent)}</span>
          </div>
          <ProgressBar value={data.loadPercent} tone="brand" />
        </div>
        <StatList
          rows={[
            { label: "Hãng", value: data.manufacturer },
            { label: "Family / Stepping", value: `${data.family} / ${data.stepping}` },
            {
              label: "Cores / Threads",
              value: `${data.cores} / ${data.threads}`,
            },
            {
              label: "Base clock",
              value: formatMHz(data.baseClockMhz),
            },
            {
              label: "Current clock",
              value: formatMHz(data.currentClockMhz),
            },
            {
              label: "Cache L2 / L3",
              value: `${data.l2CacheKb} KB / ${data.l3CacheKb} KB`,
            },
            { label: "Socket", value: data.socket || "—" },
            { label: "Architecture", value: data.architecture },
            { label: "Processor ID", value: data.processorId || "—" },
          ]}
        />
      </Card>

      <Card title="Tải từng core" subtitle="Realtime">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {(data.perCoreLoad ?? []).map((v: number, i: number) => (
            <div
              key={i}
              className="rounded-lg border border-white/5 bg-white/5 p-2"
              title={`Core ${i}: ${v.toFixed(1)}%`}
            >
              <div className="text-xs text-ink-subtle">Core {i}</div>
              <div className="mt-1 font-mono text-sm text-ink">
                {v.toFixed(0)}%
              </div>
              <ProgressBar
                value={v}
                tone={
                  v > 80 ? "danger" : v > 50 ? "warning" : "brand"
                }
                className="mt-1"
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
