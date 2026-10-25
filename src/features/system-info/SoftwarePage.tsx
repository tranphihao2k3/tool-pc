import { useMemo, useState } from "react";
import { useTauriCommand } from "@/shared/components/ErrorState";
import { Card } from "@/shared/components/Card";
import { Package, Search } from "lucide-react";
import type { InstalledApp } from "@/shared/types/system";
import { formatBytes } from "@/shared/lib/utils";

const mockApps: InstalledApp[] = [
  {
    name: "Microsoft Visual Studio Code",
    version: "1.94.0",
    publisher: "Microsoft Corporation",
    installDate: "20241001",
    estimatedSizeKb: 380000,
    installLocation: "C:\\Program Files\\Microsoft VS Code",
    uninstallString: "C:\\Program Files\\Microsoft VS Code\\unins000.exe",
    architecture: "Registry64",
    source: "Registry64",
  },
  {
    name: "Google Chrome",
    version: "130.0.6723.91",
    publisher: "Google LLC",
    installDate: "20240815",
    estimatedSizeKb: 540000,
    installLocation: "C:\\Program Files\\Google\\Chrome\\Application",
    uninstallString: "C:\\Program Files\\Google\\Chrome\\Application\\130.0.6723.91\\Installer\\setup.exe",
    architecture: "Registry64",
    source: "Registry64",
  },
  {
    name: "7-Zip",
    version: "24.07",
    publisher: "Igor Pavlov",
    installDate: "20240920",
    estimatedSizeKb: 12000,
    installLocation: "C:\\Program Files\\7-Zip",
    uninstallString: "C:\\Program Files\\7-Zip\\Uninstall.exe",
    architecture: "Registry64",
    source: "Registry64",
  },
];

export default function SoftwarePage() {
  const { data, loading, error } = useTauriCommand<InstalledApp[]>(
    "get_installed_software",
    undefined,
    { mock: mockApps }
  );

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data
      .filter((a) => {
        if (sourceFilter !== "all" && a.source !== sourceFilter) return false;
        if (search && !a.name.toLowerCase().includes(search.toLowerCase()))
          return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, search, sourceFilter]);

  if (loading && !data) {
    return <Card><div className="py-8 text-center text-ink-muted">Đang tải...</div></Card>;
  }
  if (error) {
    return <Card><div className="py-8 text-center text-danger">{error}</div></Card>;
  }
  if (!data) return null;

  const sources = Array.from(new Set(data.map((a) => a.source)));

  return (
    <div className="space-y-6">
      <Card
        title="Phần mềm đã cài"
        subtitle={`${filtered.length} / ${data.length} mục`}
        action={<Package className="h-5 w-5 text-brand-200" />}
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm text-ink placeholder-ink-subtle outline-none focus:border-brand"
            />
          </div>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="all">Tất cả nguồn</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-ink-muted">
                <th className="py-2 pr-3">Tên</th>
                <th className="py-2 pr-3">Phiên bản</th>
                <th className="py-2 pr-3">Hãng</th>
                <th className="py-2 pr-3">Kích thước</th>
                <th className="py-2 pr-3">Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr
                  key={`${a.name}-${i}`}
                  className="border-b border-white/5 hover:bg-white/5"
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium text-ink">{a.name}</div>
                    {a.installLocation && (
                      <div className="text-xs text-ink-subtle">
                        {a.installLocation}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-ink-muted">
                    {a.version || "—"}
                  </td>
                  <td className="py-2 pr-3 text-ink-muted">
                    {a.publisher || "—"}
                  </td>
                  <td className="py-2 pr-3 text-ink-muted">
                    {a.estimatedSizeKb
                      ? formatBytes(a.estimatedSizeKb * 1024)
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-ink-muted">
                      {a.source}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-ink-muted">
                    Không tìm thấy phần mềm
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
