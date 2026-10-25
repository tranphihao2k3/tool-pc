import { useTauriCommand } from "@/shared/components/ErrorState";
import { Card } from "@/shared/components/Card";
import { StatList } from "@/shared/components/StatList";
import { CircuitBoard } from "lucide-react";
import type { MainboardInfo } from "@/shared/types/system";

const mockMb: MainboardInfo = {
  manufacturer: "ASUSTeK COMPUTER INC.",
  product: "ROG STRIX B550-F GAMING",
  version: "Rev X.0x",
  serialNumber: "210310012345678",
  biosVendor: "American Megatrends Inc.",
  biosVersion: "F16",
  biosReleaseDate: "20231115",
  systemManufacturer: "ASUS",
  systemModel: "System Product Name",
  systemFamily: "ASUS MB",
  systemType: "x64-based PC",
};

export default function MainboardPage() {
  const { data, loading, error } = useTauriCommand<MainboardInfo>(
    "get_mainboard_info",
    undefined,
    { mock: mockMb }
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
        title="Mainboard"
        subtitle={data.product}
        action={<CircuitBoard className="h-5 w-5 text-brand-200" />}
      >
        <StatList
          columns={2}
          rows={[
            { label: "Hãng", value: data.manufacturer },
            { label: "Sản phẩm", value: data.product },
            { label: "Version", value: data.version },
            { label: "S/N", value: data.serialNumber || "—" },
            { label: "System manufacturer", value: data.systemManufacturer },
            { label: "System model", value: data.systemModel },
            { label: "System family", value: data.systemFamily },
            { label: "System type", value: data.systemType },
          ]}
        />
      </Card>

      <Card title="BIOS">
        <StatList
          columns={2}
          rows={[
            { label: "Vendor", value: data.biosVendor },
            { label: "Version", value: data.biosVersion },
            {
              label: "Release date",
              value: data.biosReleaseDate
                ? data.biosReleaseDate.replace(
                    /(\d{4})(\d{2})(\d{2}).*/,
                    "$1-$2-$3"
                  )
                : "—",
            },
          ]}
        />
      </Card>
    </div>
  );
}
