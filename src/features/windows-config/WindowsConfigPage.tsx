import { useState } from "react";
import { IdCard, Palette, BatteryCharging, KeyRound } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import IdentityTab from "./IdentityTab";
import PersonalizationTab from "./PersonalizationTab";
import PowerTab from "./PowerTab";
import ActivationTab from "./ActivationTab";

type TabKey = "identity" | "personalization" | "power" | "activation";

const TABS: {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "identity", label: "Định danh", icon: IdCard },
  { key: "personalization", label: "Cá nhân hóa", icon: Palette },
  { key: "power", label: "Pin & Nguồn", icon: BatteryCharging },
  { key: "activation", label: "Kích hoạt", icon: KeyRound },
];

/**
 * Trang "Thiết lập" — 4 nhóm chức năng cấu hình Windows.
 *
 * Mỗi nhóm độc lập: đọc trạng thái riêng, giữ bản nháp riêng, và có
 * nút Tải lại / Áp dụng riêng — đúng như Anhdv Boot Toolkit.
 */
export default function WindowsConfigPage() {
  const [tab, setTab] = useState<TabKey>("identity");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Thiết lập</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Thiết lập định danh, cá nhân hóa, pin &amp; nguồn và kích hoạt Windows.
        </p>
      </div>

      {/* Tab bar — 4 nhóm chức năng */}
      <nav
        aria-label="Nhóm thiết lập"
        className="flex flex-wrap gap-1 rounded-xl border border-white/5 bg-surface p-1"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand-gradient-soft text-ink shadow-glow"
                  : "text-ink-muted hover:bg-white/5 hover:text-ink"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Nội dung tab — remount khi đổi tab để mỗi tab giữ draft riêng */}
      {tab === "identity" && <IdentityTab />}
      {tab === "personalization" && <PersonalizationTab />}
      {tab === "power" && <PowerTab />}
      {tab === "activation" && <ActivationTab />}
    </div>
  );
}
