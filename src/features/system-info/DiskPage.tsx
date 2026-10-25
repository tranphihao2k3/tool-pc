import { useTauriCommand } from "@/shared/components/ErrorState";
import { Card } from "@/shared/components/Card";
import { StatList } from "@/shared/components/StatList";
import { ProgressBar } from "@/shared/components/ProgressBar";
import { formatBytes } from "@/shared/lib/utils";
import { HardDrive } from "lucide-react";
import type { DiskInfo } from "@/shared/types/system";

const mockDisk: DiskInfo = {
  physical: [
    {
      model: "Samsung SSD 980 PRO 1TB",
      interfaceType: "NVMe",
      mediaType: "SSD",
      sizeBytes: 1024 * 1024 ** 3,
      serialNumber: "S5GXNF0R876543A",
      firmware: "5B2QGXA7",
      status: "OK",
      partitions: 3,
      bytesPerSector: 512,
    },
  ],
  logical: [
    {
      deviceId: "C:",
      label: "Windows",
      fileSystem: "NTFS",
      sizeBytes: 500 * 1024 ** 3,
      freeBytes: 218 * 1024 ** 3,
      volumeSerial: "A8B3C2D1",
      driveType: "Fixed",
    },
    {
      deviceId: "D:",
      label: "Data",
      fileSystem: "NTFS",
      sizeBytes: 524 * 1024 ** 3,
      freeBytes: 312 * 1024 ** 3,
      volumeSerial: "B7D4E3F2",
      driveType: "Fixed",
    },
  ],
};

export default function DiskPage() {
  const { data, loading, error } = useTauriCommand<DiskInfo>(
    "get_disk_info",
    undefined,
    { mock: mockDisk }
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
        title="Ổ đĩa vật lý"
        subtitle={`${data.physical.length} ổ`}
        action={<HardDrive className="h-5 w-5 text-brand-200" />}
      >
        <div className="space-y-3">
          {data.physical.map((p, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/5 bg-white/5 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-ink">{p.model}</div>
                  <div className="text-xs text-ink-muted">
                    S/N: {p.serialNumber || "—"}
                  </div>
                </div>
                <div className="text-right text-xs text-ink-muted">
                  <div>{p.interfaceType} • {p.mediaType || "Unknown"}</div>
                  <div>{formatBytes(p.sizeBytes)}</div>
                </div>
              </div>
              <StatList
                columns={3}
                rows={[
                  { label: "Firmware", value: p.firmware || "—" },
                  { label: "Status", value: p.status || "—" },
                  { label: "Partitions", value: String(p.partitions) },
                ]}
              />
            </div>
          ))}
          {data.physical.length === 0 && (
            <div className="py-4 text-center text-sm text-ink-muted">
              Không tìm thấy ổ vật lý
            </div>
          )}
        </div>
      </Card>

      <Card title="Phân vùng (Volume)" subtitle={`${data.logical.length} volume`}>
        <div className="space-y-3">
          {data.logical.map((v) => {
            const usedPct = v.sizeBytes > 0
              ? ((v.sizeBytes - v.freeBytes) / v.sizeBytes) * 100
              : 0;
            return (
              <div
                key={v.deviceId}
                className="rounded-xl border border-white/5 bg-white/5 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {v.deviceId} • {v.label || "(no label)"}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {v.fileSystem} • {v.driveType}
                    </div>
                  </div>
                  <div className="text-right text-xs text-ink-muted">
                    <div>{formatBytes(v.sizeBytes)}</div>
                    <div>Còn trống: {formatBytes(v.freeBytes)}</div>
                  </div>
                </div>
                <ProgressBar
                  value={usedPct}
                  tone={usedPct > 90 ? "danger" : usedPct > 75 ? "warning" : "success"}
                />
                <div className="mt-1 text-right text-xs text-ink-subtle">
                  {usedPct.toFixed(1)}% đã dùng
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
