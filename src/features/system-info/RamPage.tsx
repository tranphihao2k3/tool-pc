import { useTauriCommand } from "@/shared/components/ErrorState";
import { Card } from "@/shared/components/Card";
import { StatList } from "@/shared/components/StatList";
import { ProgressBar } from "@/shared/components/ProgressBar";
import { formatBytes } from "@/shared/lib/utils";
import { MemoryStick } from "lucide-react";
import type { RamInfo } from "@/shared/types/system";

const mockRam: RamInfo = {
  sticks: [
    {
      capacityBytes: 16 * 1024 ** 3,
      speedMhz: 3600,
      manufacturer: "Kingston",
      partNumber: "KF3600C18D4/16GX",
      deviceLocator: "DIMM_A1",
      formFactor: "DIMM",
      memoryType: "DDR4",
      dataWidthBits: 64,
      totalWidthBits: 64,
      isEcc: false,
      configuredVoltage: 1.35,
    },
    {
      capacityBytes: 16 * 1024 ** 3,
      speedMhz: 3600,
      manufacturer: "Kingston",
      partNumber: "KF3600C18D4/16GX",
      deviceLocator: "DIMM_B1",
      formFactor: "DIMM",
      memoryType: "DDR4",
      dataWidthBits: 64,
      totalWidthBits: 64,
      isEcc: false,
      configuredVoltage: 1.35,
    },
  ],
  totalSlots: 4,
  usedSlots: 2,
  totalBytes: 32 * 1024 ** 3,
  usedBytes: 14.2 * 1024 ** 3,
  availableBytes: 17.8 * 1024 ** 3,
  cachedBytes: 4.1 * 1024 ** 3,
  swapTotalBytes: 2 * 1024 ** 3,
  swapUsedBytes: 0,
};

export default function RamPage() {
  const { data, loading, error } = useTauriCommand<RamInfo>(
    "get_ram_info",
    undefined,
    { mock: mockRam }
  );

  if (loading && !data) {
    return <Card><div className="py-8 text-center text-ink-muted">Đang tải...</div></Card>;
  }
  if (error) {
    return <Card><div className="py-8 text-center text-danger">{error}</div></Card>;
  }
  if (!data) return null;

  const usedPct = data.totalBytes > 0
    ? (data.usedBytes / data.totalBytes) * 100
    : 0;

  return (
    <div className="space-y-6">
      <Card
        title="RAM"
        subtitle={`${data.usedSlots}/${data.totalSlots} thanh`}
        action={<MemoryStick className="h-5 w-5 text-brand-200" />}
      >
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
            <span>Đang dùng</span>
            <span className="font-mono text-ink">
              {formatBytes(data.usedBytes)} / {formatBytes(data.totalBytes)}
            </span>
          </div>
          <ProgressBar value={usedPct} tone="brand" />
        </div>
        <StatList
          rows={[
            { label: "Tổng", value: formatBytes(data.totalBytes) },
            { label: "Đã dùng", value: formatBytes(data.usedBytes) },
            { label: "Khả dụng", value: formatBytes(data.availableBytes) },
            { label: "Cached", value: formatBytes(data.cachedBytes) },
            {
              label: "Swap",
              value: data.swapTotalBytes > 0
                ? `${formatBytes(data.swapUsedBytes)} / ${formatBytes(data.swapTotalBytes)}`
                : "—",
            },
          ]}
        />
      </Card>

      <Card title="Danh sách thanh RAM" subtitle={`${data.sticks.length} thanh`}>
        <div className="space-y-3">
          {data.sticks.map((s, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/5 bg-white/5 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-ink">
                    {s.deviceLocator || `Slot ${i + 1}`}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {s.manufacturer} {s.partNumber}
                  </div>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  <div>{s.memoryType} {s.speedMhz} MHz</div>
                  <div>{formatBytes(s.capacityBytes)} • {s.isEcc ? "ECC" : "Non-ECC"}</div>
                </div>
              </div>
              <StatList
                columns={3}
                rows={[
                  { label: "Form factor", value: s.formFactor },
                  {
                    label: "Width",
                    value: `${s.dataWidthBits}/${s.totalWidthBits} bit`,
                  },
                  {
                    label: "Voltage",
                    value: `${s.configuredVoltage.toFixed(2)} V`,
                  },
                ]}
              />
            </div>
          ))}
          {data.sticks.length === 0 && (
            <div className="py-4 text-center text-sm text-ink-muted">
              Không lấy được thông tin chi tiết
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
