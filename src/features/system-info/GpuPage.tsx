import { useTauriCommand } from "@/shared/components/ErrorState";
import { Card } from "@/shared/components/Card";
import { StatList } from "@/shared/components/StatList";
import { formatBytes } from "@/shared/lib/utils";
import { MonitorPlay } from "lucide-react";
import type { GpuInfo } from "@/shared/types/system";

const mockGpu: GpuInfo = {
  name: "NVIDIA GeForce RTX 4060",
  adapterCompatibility: "NVIDIA",
  vramBytes: 8 * 1024 ** 3,
  driverVersion: "31.0.15.3667",
  driverDate: "20240815",
  videoProcessor: "AD107",
  currentResolution: "2560x1440",
  currentRefreshRate: 144,
  maxRefreshRate: 144,
  isDiscrete: true,
  temperatureC: null,
  utilizationPercent: null,
};

const mockIntegrated: GpuInfo = {
  name: "AMD Radeon(TM) Graphics",
  adapterCompatibility: "Advanced Micro Devices, Inc.",
  vramBytes: 512 * 1024 ** 2,
  driverVersion: "31.0.21001.4507",
  driverDate: "20240301",
  videoProcessor: "Renoire",
  currentResolution: "1920x1080",
  currentRefreshRate: 60,
  maxRefreshRate: 60,
  isDiscrete: false,
  temperatureC: null,
  utilizationPercent: null,
};

export default function GpuPage() {
  const { data, loading, error } = useTauriCommand<GpuInfo[]>(
    "get_gpu_info",
    undefined,
    { mock: [mockGpu, mockIntegrated] }
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
        title="GPU"
        subtitle={`${data.length} card`}
        action={<MonitorPlay className="h-5 w-5 text-brand-200" />}
      >
        <div className="space-y-4">
          {data.map((g, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/5 bg-white/5 p-4"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink">{g.name}</div>
                  <div className="text-xs text-ink-muted">
                    {g.adapterCompatibility} •{" "}
                    <span
                      className={
                        g.isDiscrete ? "text-success" : "text-ink-subtle"
                      }
                    >
                      {g.isDiscrete ? "Discrete (rời)" : "Integrated (onboard)"}
                    </span>
                  </div>
                </div>
              </div>
              <StatList
                columns={2}
                rows={[
                  { label: "VRAM", value: formatBytes(g.vramBytes) },
                  {
                    label: "VRAM đang dùng",
                    value:
                      g.vramUsedBytes != null
                        ? formatBytes(g.vramUsedBytes)
                        : "—",
                  },
                  { label: "Driver", value: g.driverVersion || "—" },
                  {
                    label: "Driver date",
                    value: g.driverDate
                      ? g.driverDate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
                      : "—",
                  },
                  { label: "Video processor", value: g.videoProcessor || "—" },
                  { label: "Resolution", value: g.currentResolution || "—" },
                  {
                    label: "Refresh rate",
                    value: `${g.currentRefreshRate} Hz${
                      g.maxRefreshRate > 0
                        ? ` (max ${g.maxRefreshRate} Hz)`
                        : ""
                    }`,
                  },
                  {
                    label: "Tải GPU",
                    value:
                      g.utilizationPercent != null
                        ? `${g.utilizationPercent.toFixed(0)}%`
                        : "—",
                  },
                  {
                    label: "Nhiệt độ",
                    value:
                      g.temperatureC != null
                        ? `${g.temperatureC.toFixed(0)}°C`
                        : "—",
                  },
                ]}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
