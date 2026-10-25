import { useTauriCommand } from "@/shared/components/ErrorState";
import { Card } from "@/shared/components/Card";
import { StatList } from "@/shared/components/StatList";
import { formatBytes } from "@/shared/lib/utils";
import { Network as NetworkIcon } from "lucide-react";
import type { NetworkAdapter } from "@/shared/types/system";

const mockNet: NetworkAdapter[] = [
  {
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
  },
  {
    name: "Wi-Fi",
    description: "Intel(R) Wi-Fi 6 AX201 160MHz",
    macAddress: "11:22:33:44:55:66",
    ipv4: ["192.168.1.105"],
    ipv6: [],
    subnet: ["255.255.255.0"],
    gateway: ["192.168.1.1"],
    dns: ["8.8.8.8"],
    speedBps: 866_000_000,
    interfaceType: "Wireless",
    isConnected: false,
    rxBytes: 0,
    txBytes: 0,
  },
];

export default function NetworkPage() {
  const { data, loading, error } = useTauriCommand<NetworkAdapter[]>(
    "get_network_info",
    undefined,
    { mock: mockNet }
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
        title="Network adapters"
        subtitle={`${data.length} adapter`}
        action={<NetworkIcon className="h-5 w-5 text-brand-200" />}
      >
        <div className="space-y-4">
          {data.map((n, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/5 bg-white/5 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink">{n.name}</div>
                  <div className="text-xs text-ink-muted">{n.description}</div>
                </div>
                <div>
                  {n.isConnected ? (
                    <span className="pill-success">Đang kết nối</span>
                  ) : (
                    <span className="pill-warning">Mất kết nối</span>
                  )}
                </div>
              </div>
              <StatList
                columns={2}
                rows={[
                  { label: "MAC", value: n.macAddress || "—" },
                  { label: "Interface", value: n.interfaceType || "—" },
                  {
                    label: "Speed",
                    value: n.speedBps > 0
                      ? n.speedBps >= 1e9
                        ? `${(n.speedBps / 1e9).toFixed(1)} Gbps`
                        : `${(n.speedBps / 1e6).toFixed(0)} Mbps`
                      : "—",
                  },
                  {
                    label: "RX / TX",
                    value: `${formatBytes(n.rxBytes)} / ${formatBytes(n.txBytes)}`,
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
