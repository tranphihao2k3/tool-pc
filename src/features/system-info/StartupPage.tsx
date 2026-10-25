import { useTauriCommand } from "@/shared/components/ErrorState";
import { Card } from "@/shared/components/Card";
import { Power } from "lucide-react";
import type { StartupProgram } from "@/shared/types/system";

const mockStartup: StartupProgram[] = [
  {
    name: "OneDrive",
    command: '"C:\\Users\\user\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe" /background',
    location: "RegistryRun",
    scope: "HKCU",
    enabled: true,
    publisher: "Microsoft Corporation",
    impact: "Low",
  },
  {
    name: "Steam",
    command: '"C:\\Program Files (x86)\\Steam\\Steam.exe" -silent',
    location: "RegistryRun",
    scope: "HKCU",
    enabled: true,
    publisher: "Valve Corporation",
    impact: "Medium",
  },
  {
    name: "SecurityHealth",
    command: '%windir%\\system32\\SecurityHealthSystray.exe',
    location: "RegistryRun",
    scope: "HKLM",
    enabled: true,
    publisher: "Microsoft Corporation",
    impact: "High",
  },
];

export default function StartupPage() {
  const { data, loading, error } = useTauriCommand<StartupProgram[]>(
    "get_startup_programs",
    undefined,
    { mock: mockStartup }
  );

  if (loading && !data) {
    return <Card><div className="py-8 text-center text-ink-muted">Đang tải...</div></Card>;
  }
  if (error) {
    return <Card><div className="py-8 text-center text-danger">{error}</div></Card>;
  }
  if (!data) return null;

  const impactTone: Record<string, string> = {
    High: "bg-danger/20 text-danger",
    Medium: "bg-warning/20 text-warning",
    Low: "bg-success/20 text-success",
    Unknown: "bg-white/10 text-ink-muted",
  };

  return (
    <div className="space-y-6">
      <Card
        title="Chương trình khởi động cùng Windows"
        subtitle={`${data.length} mục`}
        action={<Power className="h-5 w-5 text-brand-200" />}
      >
        <div className="space-y-2">
          {data.map((s, i) => (
            <div
              key={`${s.name}-${i}`}
              className="rounded-xl border border-white/5 bg-white/5 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-medium text-ink">
                      {s.name}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        impactTone[s.impact] || impactTone.Unknown
                      }`}
                    >
                      {s.impact}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-ink-subtle">
                    {s.command}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                    <span className="rounded bg-white/10 px-1.5 py-0.5">
                      {s.location}
                    </span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5">
                      {s.scope}
                    </span>
                    {s.publisher && <span>• {s.publisher}</span>}
                  </div>
                </div>
                <div>
                  {s.enabled ? (
                    <span className="pill-success">Bật</span>
                  ) : (
                    <span className="pill-warning">Tắt</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <div className="py-6 text-center text-sm text-ink-muted">
              Không có chương trình khởi động nào
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
