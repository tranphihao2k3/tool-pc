import { useTranslation } from "react-i18next";
import { useTauriCommand } from "@/shared/components/ErrorState";
import { Card } from "@/shared/components/Card";
import { StatList } from "@/shared/components/StatList";
import { ErrorState } from "@/shared/components/ErrorState";
import { formatBytes } from "@/shared/lib/utils";
import type {
  OsInfo,
  CpuCore,
  RamInfo,
  DiskInfo,
  GpuInfo,
  NetworkAdapter,
} from "@/shared/types/system";

const mockOs: OsInfo = {
  productName: "Windows 11 Pro",
  displayVersion: "23H2",
  build: "22631.4391",
  ubr: 4391,
  edition: "Professional",
  installationType: "Client",
  registeredOwner: "User",
  hostname: "DESKTOP-ABC123",
  architecture: "x64",
  uptimeSeconds: 14523,
  activated: true,
};

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
  family: "Zen 3",
  stepping: "0",
  loadPercent: 23.4,
  perCoreLoad: [12, 18, 22, 30, 15, 25, 28, 20, 14, 22, 31, 17, 26, 23, 19, 28],
  temperatureC: 58,
};

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
  ],
  totalSlots: 4,
  usedSlots: 1,
  totalBytes: 16 * 1024 ** 3,
  usedBytes: 8.2 * 1024 ** 3,
  availableBytes: 7.8 * 1024 ** 3,
  cachedBytes: 2.1 * 1024 ** 3,
  swapTotalBytes: 0,
  swapUsedBytes: 0,
};

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
  temperatureC: 62,
  utilizationPercent: 18,
};

const mockNet: NetworkAdapter = {
  name: "Ethernet",
  description: "Intel(R) Ethernet Connection I219-V",
  macAddress: "AA:BB:CC:DD:EE:FF",
  ipv4: ["192.168.1.100"],
  ipv6: ["fe80::abcd::1234"],
  subnet: ["255.255.255.0"],
  gateway: ["192.168.1.1"],
  dns: ["8.8.8.8", "1.1.1.1"],
  speedBps: 1_000_000_000,
  interfaceType: "Ethernet",
  isConnected: true,
  rxBytes: 1.2 * 1024 ** 3,
  txBytes: 256 * 1024 ** 2,
};

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d} ngày ${h} giờ ${m} phút`;
}

export default function SystemOverviewPage() {
  const { t } = useTranslation();
  const osQ = useTauriCommand<OsInfo>("get_os_info", undefined, { mock: mockOs });
  const cpuQ = useTauriCommand<CpuCore>("get_cpu_info", undefined, { mock: mockCpu });
  const ramQ = useTauriCommand<RamInfo>("get_ram_info", undefined, { mock: mockRam });
  const diskQ = useTauriCommand<DiskInfo>("get_disk_info", undefined, { mock: mockDisk });
  const gpuQ = useTauriCommand<GpuInfo[]>("get_gpu_info", undefined, {
    mock: [mockGpu],
  });
  const netQ = useTauriCommand<NetworkAdapter[]>("get_network_info", undefined, {
    mock: [mockNet],
  });

  // `get_gpu_info` trả về DANH SÁCH card (rời + onboard).
  // Card rời được ưu tiên vì đó là GPU người dùng quan tâm.
  const primaryGpu =
    gpuQ.data?.find((g) => g.isDiscrete) ?? gpuQ.data?.[0] ?? null;

  if (osQ.error)
    return <ErrorState error={osQ.error} onRetry={osQ.refetch} title="Không tải được thông tin hệ thống" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Hệ điều hành" subtitle="Thông tin chung">
          <StatList
            rows={[
              { label: "Tên", value: osQ.data?.productName ?? "—" },
              { label: "Phiên bản", value: osQ.data ? `${osQ.data.displayVersion} (build ${osQ.data.build})` : "—" },
              { label: "Edition", value: osQ.data?.edition ?? "—" },
              { label: "Architecture", value: osQ.data?.architecture ?? "—" },
              { label: "Hostname", value: osQ.data?.hostname ?? "—" },
              { label: "Uptime", value: osQ.data ? formatUptime(osQ.data.uptimeSeconds) : "—" },
              {
                label: "Kích hoạt",
                value: osQ.data?.activated ? (
                  <span className="pill-success">Đã kích hoạt</span>
                ) : (
                  <span className="pill-warning">Chưa kích hoạt</span>
                ),
              },
            ]}
          />
        </Card>

        <Card title="CPU" subtitle={`${cpuQ.data?.manufacturer} ${cpuQ.data?.family}`}>
          <StatList
            rows={[
              { label: "Tên", value: cpuQ.data?.name ?? "—" },
              { label: "Cores / Threads", value: cpuQ.data ? `${cpuQ.data.cores} / ${cpuQ.data.threads}` : "—" },
              {
                label: "Base / Current",
                value: cpuQ.data
                  ? `${(cpuQ.data.baseClockMhz / 1000).toFixed(2)} / ${(
                      cpuQ.data.currentClockMhz / 1000
                    ).toFixed(2)} GHz`
                  : "—",
              },
              {
                label: "Cache",
                value: cpuQ.data
                  ? `L2 ${cpuQ.data.l2CacheKb} KB / L3 ${cpuQ.data.l3CacheKb} KB`
                  : "—",
              },
              { label: "Socket", value: cpuQ.data?.socket ?? "—" },
              {
                label: "Tải",
                value: cpuQ.data ? `${cpuQ.data.loadPercent.toFixed(1)}%` : "—",
                hint: cpuQ.data?.temperatureC ? `${cpuQ.data.temperatureC}°C` : undefined,
              },
            ]}
          />
        </Card>

        <Card title="RAM" subtitle={`${ramQ.data?.usedSlots}/${ramQ.data?.totalSlots} thanh`}>
          <StatList
            rows={[
              {
                label: "Tổng",
                value: ramQ.data ? formatBytes(ramQ.data.totalBytes) : "—",
              },
              {
                label: "Đã dùng",
                value: ramQ.data ? formatBytes(ramQ.data.usedBytes) : "—",
              },
              {
                label: "Khả dụng",
                value: ramQ.data ? formatBytes(ramQ.data.availableBytes) : "—",
              },
              {
                label: "Cache",
                value: ramQ.data ? formatBytes(ramQ.data.cachedBytes) : "—",
              },
            ]}
          />
        </Card>

        <Card title="Ổ đĩa" subtitle={`${diskQ.data?.physical.length} ổ vật lý`}>
          <StatList
            rows={
              diskQ.data?.physical.map((p) => ({
                label: p.model,
                value: formatBytes(p.sizeBytes),
                hint: p.interfaceType,
              })) ?? []
            }
          />
        </Card>

        <Card title="GPU" subtitle={primaryGpu?.adapterCompatibility}>
          <StatList
            rows={[
              { label: "Tên", value: primaryGpu?.name ?? "—" },
              {
                label: "VRAM",
                value: primaryGpu ? formatBytes(primaryGpu.vramBytes) : "—",
                hint:
                  primaryGpu?.vramUsedBytes != null
                    ? `${formatBytes(primaryGpu.vramUsedBytes)} đang dùng`
                    : undefined,
              },
              { label: "Driver", value: primaryGpu?.driverVersion || "—" },
              { label: "Resolution", value: primaryGpu?.currentResolution || "—" },
              {
                label: "Tải",
                value:
                  primaryGpu?.utilizationPercent != null
                    ? `${primaryGpu.utilizationPercent.toFixed(0)}%`
                    : "—",
                hint:
                  primaryGpu?.temperatureC != null
                    ? `${primaryGpu.temperatureC.toFixed(0)}°C`
                    : undefined,
              },
            ]}
          />
        </Card>

        <Card title="Mạng" subtitle="Adapter đang kết nối">
          <StatList
            rows={
              (netQ.data ?? []).slice(0, 1).map((n) => [
                { label: "Tên", value: n.name },
                { label: "IPv4", value: n.ipv4.join(", ") || "—" },
                { label: "Gateway", value: n.gateway.join(", ") || "—" },
                { label: "DNS", value: n.dns.join(", ") || "—" },
                {
                  label: "Tốc độ",
                  value: n.speedBps > 0 ? `${(n.speedBps / 1e9).toFixed(1)} Gbps` : "—",
                },
              ])[0] ?? []
            }
          />
        </Card>
      </div>
    </div>
  );
}
