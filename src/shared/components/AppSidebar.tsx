import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Cpu,
  MemoryStick,
  CircuitBoard,
  HardDrive,
  MonitorPlay,
  Network,
  Package,
  Power,
  Sparkles,
  Trash2,
  Zap,
  Wrench,
  ShieldCheck,
  AppWindow,
  Settings,
  SlidersHorizontal,
  ScanLine,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "Tổng quan",
    items: [
      { to: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
    ],
  },
  {
    title: "Thông tin hệ thống",
    items: [
      { to: "/system", label: "Hệ thống", icon: MonitorPlay },
      { to: "/system/cpu", label: "CPU", icon: Cpu },
      { to: "/system/ram", label: "RAM", icon: MemoryStick },
      { to: "/system/mainboard", label: "Mainboard", icon: CircuitBoard },
      { to: "/system/disk", label: "Ổ đĩa", icon: HardDrive },
      { to: "/system/gpu", label: "GPU", icon: MonitorPlay },
      { to: "/system/network", label: "Mạng", icon: Network },
      { to: "/system/software", label: "Phần mềm", icon: Package },
      { to: "/system/startup", label: "Khởi động", icon: Power },
    ],
  },
  {
    title: "Tối ưu & Bảo mật",
    items: [
      { to: "/optimize/cleaner", label: "Dọn rác", icon: Trash2 },
      { to: "/optimize/booster", label: "Tăng tốc", icon: Zap },
      { to: "/optimize/repair", label: "Sửa lỗi", icon: Wrench },
      { to: "/security", label: "Bảo mật", icon: ShieldCheck },
      { to: "/driver", label: "Driver", icon: ScanLine },
    ],
  },
  {
    title: "Khác",
    items: [
      { to: "/tools", label: "Tiện ích", icon: AppWindow },
      { to: "/windows-config", label: "Thiết lập", icon: SlidersHorizontal },
      { to: "/settings", label: "Cài đặt", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-white/5 bg-bg-50">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient shadow-glow">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink">PC Manager</div>
          <div className="text-xs text-ink-muted">Pro v0.1</div>
        </div>
      </div>

      <nav
        className="flex-1 space-y-5 overflow-y-auto px-3 py-2"
        aria-label="Điều hướng chính"
      >
        {groups.map((group) => (
          <div key={group.title}>
            <div
              className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
              role="heading"
              aria-level={3}
            >
              {group.title}
            </div>
            <ul className="space-y-1" role="list">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === "/dashboard" || item.to === "/system"}
                      className={({ isActive }) =>
                        cn("nav-item", isActive && "nav-item-active")
                      }
                      aria-label={item.label}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-xl border border-white/5 bg-card-glow p-3 text-xs text-ink-muted">
        <div className="mb-1 font-medium text-ink">Chạy từ USB</div>
        Mọi dữ liệu được lưu cục bộ, không cần cài đặt.
      </div>
    </aside>
  );
}
