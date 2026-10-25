import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, ShieldCheck, ShieldAlert, Activity } from "lucide-react";
import { useSettingsStore } from "@/features/settings/settingsStore";
import { useElevation } from "@/features/settings/useElevation";

const routeTitle: Record<string, string> = {
  "/dashboard": "Tổng quan",
  "/system": "Thông tin hệ thống",
  "/system/cpu": "CPU",
  "/system/ram": "RAM",
  "/system/mainboard": "Mainboard",
  "/system/disk": "Ổ đĩa",
  "/system/gpu": "GPU",
  "/system/network": "Mạng",
  "/system/software": "Phần mềm",
  "/system/startup": "Khởi động cùng Windows",
  "/optimize/cleaner": "Dọn rác hệ thống",
  "/optimize/booster": "Tăng tốc hệ thống",
  "/optimize/repair": "Sửa lỗi Windows",
  "/security": "Bảo mật & Quét virus",
  "/driver": "Quản lý Driver",
  "/tools": "Tiện ích",
  "/windows-config": "Thiết lập Windows",
  "/settings": "Cài đặt",
};

export function AppTopbar() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const language = useSettingsStore((s) => s.settings.ui.language);
  const patchUi = useSettingsStore((s) => s.patchUi);
  const [time, setTime] = useState(new Date());
  const { status: elevationStatus } = useElevation();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Đồng bộ i18n.language ↔ settings store
  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
      localStorage.setItem("lang", language);
    }
  }, [language, i18n]);

  const title = routeTitle[pathname] ?? "PC Manager Pro";
  const elevated = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  return (
    <header
      role="banner"
      className="flex h-16 items-center justify-between border-b border-white/5 bg-bg-50/80 px-6 backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {elevated ? (
          <span
            className="pill-success"
            title="App đang chạy trong Tauri shell"
            aria-label="Đang chạy native"
          >
            <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Native
          </span>
        ) : (
          <span
            className="pill-warning"
            title="Đang chạy trong trình duyệt (dev mode)"
            aria-label="Đang chạy ở dev mode"
          >
            <Activity className="h-3 w-3" aria-hidden="true" /> Dev
          </span>
        )}
        {/* Badge quyền Administrator — chỉ hiện trong app native */}
        {elevated && elevationStatus && (
          <span
            className={elevationStatus.isElevated ? "pill-success" : "pill-warning"}
            title={
              elevationStatus.isElevated
                ? "App đang chạy với quyền Administrator"
                : "App đang chạy với quyền user thường"
            }
            aria-label={
              elevationStatus.isElevated
                ? "Đang chạy với quyền Administrator"
                : "Đang chạy với quyền user thường"
            }
          >
            {elevationStatus.isElevated ? (
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            )}
            Admin
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div
          className="hidden text-right md:block"
          aria-label="Thời gian hiện tại"
        >
          <div className="text-sm font-medium text-ink" aria-live="off">
            {time.toLocaleTimeString("vi-VN")}
          </div>
          <div className="text-xs text-ink-muted">
            {time.toLocaleDateString("vi-VN", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost"
          aria-label="Thông báo"
          title="Thông báo"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
        </button>
        <select
          value={language}
          onChange={(e) => {
            const next = e.target.value as "vi" | "en";
            patchUi({ language: next });
            // effect trên sẽ tự đồng bộ i18n + localStorage
          }}
          className="rounded-lg border border-white/10 bg-bg-100 px-2 py-1 text-xs text-ink"
          aria-label="Ngôn ngữ hiển thị"
        >
          <option value="vi">VI</option>
          <option value="en">EN</option>
        </select>
      </div>
    </header>
  );
}
