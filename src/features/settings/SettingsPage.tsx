import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Settings as SettingsIcon,
  Globe,
  Monitor,
  Bell,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Info,
  RotateCcw,
  Save,
  CheckCircle2,
  Sparkles,
  Github,
  Cpu,
} from "lucide-react";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { Switch } from "@/shared/components/Switch";
import { Segmented } from "@/shared/components/Segmented";
import { UpdatePanel } from "./UpdatePanel";
import { useElevation } from "./useElevation";
import {
  DEFAULT_SETTINGS,
  useSettingsStore,
  type AppSettings,
} from "./settingsStore";

type TabKey = "general" | "startup" | "notification" | "security" | "monitor" | "about";

const TABS: { key: TabKey; labelKey: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "general", labelKey: "settings.tab.general", icon: SettingsIcon },
  { key: "startup", labelKey: "settings.tab.startup", icon: Monitor },
  { key: "notification", labelKey: "settings.tab.notification", icon: Bell },
  { key: "security", labelKey: "settings.tab.security", icon: Shield },
  { key: "monitor", labelKey: "settings.tab.monitor", icon: Activity },
  { key: "about", labelKey: "settings.tab.about", icon: Info },
];

/** So sánh shallow 2 object settings để phát hiện dirty. */
function isDirty(a: AppSettings, b: AppSettings): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const patchUi = useSettingsStore((s) => s.patchUi);
  const patchStartup = useSettingsStore((s) => s.patchStartup);
  const patchNotification = useSettingsStore((s) => s.patchNotification);
  const patchSecurity = useSettingsStore((s) => s.patchSecurity);
  const patchMonitor = useSettingsStore((s) => s.patchMonitor);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);

  // Đồng bộ language với i18n khi user đổi trong Settings
  useEffect(() => {
    if (i18n.language !== settings.ui.language) {
      i18n.changeLanguage(settings.ui.language);
      localStorage.setItem("lang", settings.ui.language);
    }
  }, [settings.ui.language, i18n]);

  const dirty = useMemo(
    () => isDirty(settings, DEFAULT_SETTINGS),
    [settings]
  );

  // Toast reset flag
  const justSavedRef = useRef(false);

  const handleReset = () => {
    if (
      window.confirm(
        t("settings.confirmReset", "Khôi phục tất cả cài đặt về mặc định?")
      )
    ) {
      resetToDefaults();
    }
  };

  const handleSave = () => {
    // Hiện tại store auto-persist; "Save" chỉ là feedback visual.
    // Trong tương lai có thể gọi tauri command để apply các setting OS-level
    // (autoLaunch, minimizeToTray) → ghi vào plugin-store.
    setSettings({ ...settings });
    justSavedRef.current = true;
    setTimeout(() => {
      justSavedRef.current = false;
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">
            {t("nav.settings", "Cài đặt")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {t(
              "settings.subtitle",
              "Tùy chỉnh giao diện, khởi động, thông báo và bảo mật của PC Manager Pro."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-ink-muted">
              {t("settings.unsavedHint", "Có thay đổi chưa lưu")}
            </span>
          )}
          <Button variant="secondary" onClick={handleReset} disabled={!dirty}>
            <RotateCcw className="h-4 w-4" />
            {t("settings.reset", "Khôi phục mặc định")}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!dirty}>
            {justSavedRef.current ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {t("settings.saved", "Đã lưu")}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {t("settings.save", "Lưu thay đổi")}
              </>
            )}
          </Button>
        </div>
      </div>

      <SettingsContent
        settings={settings}
        patchUi={patchUi}
        patchStartup={patchStartup}
        patchNotification={patchNotification}
        patchSecurity={patchSecurity}
        patchMonitor={patchMonitor}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components cho mỗi tab — tách riêng để code dễ đọc
// ─────────────────────────────────────────────────────────────────────────────

function SettingsContent(props: {
  settings: AppSettings;
  patchUi: (p: Partial<AppSettings["ui"]>) => void;
  patchStartup: (p: Partial<AppSettings["startup"]>) => void;
  patchNotification: (p: Partial<AppSettings["notification"]>) => void;
  patchSecurity: (p: Partial<AppSettings["security"]>) => void;
  patchMonitor: (p: Partial<AppSettings["monitor"]>) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>("general");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      {/* Sidebar tabs */}
      <nav
        className="space-y-1 rounded-lg border border-white/5 bg-bg-50/40 p-2"
        aria-label="Settings sections"
      >
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.key;
          return (
            <button
              key={entry.key}
              onClick={() => setTab(entry.key)}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                active
                  ? "bg-brand/15 text-brand-100"
                  : "text-ink-muted hover:bg-white/5 hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(entry.labelKey, entry.key)}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div className="space-y-6">
        {tab === "general" && <GeneralTab {...props} />}
        {tab === "startup" && <StartupTab {...props} />}
        {tab === "notification" && <NotificationTab {...props} />}
        {tab === "security" && <SecurityTab {...props} />}
        {tab === "monitor" && <MonitorTab {...props} />}
        {tab === "about" && <AboutTab />}
      </div>
    </div>
  );
}

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {desc && <p className="mt-0.5 text-xs text-ink-muted">{desc}</p>}
    </div>
  );
}

function Row({
  label,
  desc,
  control,
}: {
  label: string;
  desc?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        {desc && <div className="mt-0.5 text-xs text-ink-muted">{desc}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

// ── Tab: General (UX-29) ────────────────────────────────────────────────────
function GeneralTab({
  settings,
  patchUi,
}: {
  settings: AppSettings;
  patchUi: (p: Partial<AppSettings["ui"]>) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Card title={t("settings.general.appearance", "Giao diện")}>
        <SectionHeader
          title={t("settings.general.theme", "Theme")}
          desc={t(
            "settings.general.themeDesc",
            "Hiện tại app chỉ hỗ trợ Dark. Light/System sẽ thêm ở bản sau."
          )}
        />
        <Segmented
          value={settings.ui.theme}
          onChange={(v) => patchUi({ theme: v })}
          options={[
            { value: "dark", label: "Dark", desc: "Mặc định" },
            { value: "light", label: "Light", desc: "Sắp ra mắt", },
            { value: "system", label: "System", desc: "Theo Windows" },
          ]}
        />

        <div className="mt-6">
          <SectionHeader
            title={t("settings.general.language", "Ngôn ngữ")}
            desc={t(
              "settings.general.languageDesc",
              "Áp dụng ngay, không cần khởi động lại."
            )}
          />
          <Segmented
            value={settings.ui.language}
            onChange={(v) => patchUi({ language: v as "vi" | "en" })}
            options={[
              { value: "vi", label: "Tiếng Việt" },
              { value: "en", label: "English" },
            ]}
          />
        </div>

        <div className="mt-6">
          <SectionHeader
            title={t("settings.general.fontSize", "Cỡ chữ")}
            desc={t(
              "settings.general.fontSizeDesc",
              `${settings.ui.fontSize}px — áp dụng toàn app.`
            )}
          />
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={12}
              max={18}
              step={1}
              value={settings.ui.fontSize}
              onChange={(e) => patchUi({ fontSize: Number(e.target.value) })}
              className="h-2 w-full max-w-xs cursor-pointer appearance-none rounded-lg bg-white/10 accent-brand"
              aria-label="Font size"
            />
            <span className="min-w-[3ch] text-right text-sm font-mono text-ink">
              {settings.ui.fontSize}px
            </span>
          </div>
        </div>
      </Card>
    </>
  );
}

// ── Tab: Startup ────────────────────────────────────────────────────────────
function StartupTab({
  settings,
  patchStartup,
}: {
  settings: AppSettings;
  patchStartup: (p: Partial<AppSettings["startup"]>) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card
      title={t("settings.startup.title", "Khởi động cùng Windows")}
      subtitle={t(
        "settings.startup.subtitle",
        "Một số tùy chọn cần restart app để có hiệu lực."
      )}
    >
      <Row
        label={t("settings.startup.autoLaunch", "Tự khởi động khi đăng nhập")}
        desc={t(
          "settings.startup.autoLaunchDesc",
          "PC Manager Pro sẽ chạy nền khi Windows boot vào user."
        )}
        control={
          <Switch
            checked={settings.startup.autoLaunch}
            onChange={(v) => patchStartup({ autoLaunch: v })}
          />
        }
      />
      <Row
        label={t("settings.startup.minimizeToTray", "Thu nhỏ vào system tray")}
        desc={t(
          "settings.startup.minimizeToTrayDesc",
          "Khi tắt cửa sổ chính, app ẩn xuống tray thay vì thoát hẳn."
        )}
        control={
          <Switch
            checked={settings.startup.minimizeToTray}
            onChange={(v) => patchStartup({ minimizeToTray: v })}
          />
        }
      />
      <Row
        label={t("settings.startup.checkUpdate", "Tự động kiểm tra cập nhật")}
        desc={t(
          "settings.startup.checkUpdateDesc",
          "Mỗi ngày kiểm tra 1 lần qua GitHub Releases."
        )}
        control={
          <Switch
            checked={settings.startup.checkUpdate}
            onChange={(v) => patchStartup({ checkUpdate: v })}
          />
        }
      />
    </Card>
  );
}

// ── Tab: Notification ───────────────────────────────────────────────────────
function NotificationTab({
  settings,
  patchNotification,
}: {
  settings: AppSettings;
  patchNotification: (p: Partial<AppSettings["notification"]>) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card
      title={t("settings.notification.title", "Thông báo")}
      subtitle={t(
        "settings.notification.subtitle",
        "Cảnh báo khi quét xong, update, hoặc phát hiện bất thường."
      )}
    >
      <Row
        label={t("settings.notification.enabled", "Bật thông báo hệ thống")}
        desc={t(
          "settings.notification.enabledDesc",
          "Hiển thị toast Windows khi có sự kiện."
        )}
        control={
          <Switch
            checked={settings.notification.enabled}
            onChange={(v) => patchNotification({ enabled: v })}
          />
        }
      />
      <Row
        label={t("settings.notification.sound", "Phát âm thanh")}
        desc={t(
          "settings.notification.soundDesc",
          "Cần bật thông báo hệ thống ở trên để có hiệu lực."
        )}
        control={
          <Switch
            checked={settings.notification.sound}
            onChange={(v) => patchNotification({ sound: v })}
            disabled={!settings.notification.enabled}
          />
        }
      />
    </Card>
  );
}

// ── Tab: Security ───────────────────────────────────────────────────────────
function SecurityTab({
  settings,
  patchSecurity,
}: {
  settings: AppSettings;
  patchSecurity: (p: Partial<AppSettings["security"]>) => void;
}) {
  const { t } = useTranslation();
  const { status, loading, setAutoElevate, restartAsAdmin } = useElevation();

  return (
    <>
      <Card
        title={t("settings.security.title", "Bảo mật")}
        subtitle={t(
          "settings.security.subtitle",
          "Các tùy chọn giới hạn quyền khi chạy app."
        )}
      >
        <Row
          label={t("settings.security.requireAdmin", "Yêu cầu quyền admin")}
          desc={t(
            "settings.security.requireAdminDesc",
            "Một số chức năng (SFC, DISM, xóa file hệ thống) cần admin. App sẽ nhắc nếu thiếu."
          )}
          control={
            <Switch
              checked={status?.autoElevate ?? settings.security.requireAdmin}
              onChange={(v) => void setAutoElevate(v)}
              disabled={loading}
            />
          }
        />
        <Row
          label={t("settings.security.pinLock", "Khóa app bằng PIN")}
          desc={t(
            "settings.security.pinLockDesc",
            "Yêu cầu nhập PIN 6 số khi mở app. Tính năng sẽ có ở bản 0.2."
          )}
          control={
            <Switch
              checked={settings.security.pinLock}
              onChange={(v) => patchSecurity({ pinLock: v })}
              disabled
            />
          }
        />
      </Card>

      {/* ── Tự nâng quyền Administrator ─────────────────────────────── */}
      <Card
        title={t("settings.elevation.title", "Quyền Administrator")}
        subtitle={t(
          "settings.elevation.subtitle",
          "Tự nâng quyền khi mở app để mọi chức năng hệ thống hoạt động đầy đủ."
        )}
      >
        {/* Trạng thái hiện tại */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
          {status?.isElevated ? (
            <span className="pill-success">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              {t("settings.elevation.runningAsAdmin", "Đang chạy với quyền Admin")}
            </span>
          ) : (
            <span className="pill-warning">
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
              {t("settings.elevation.runningAsUser", "Đang chạy với quyền User")}
            </span>
          )}
          {status?.devMode && (
            <span className="pill-brand">
              {t("settings.elevation.devMode", "Dev mode — tự nâng quyền tạm bị tắt")}
            </span>
          )}
        </div>

        <Row
          label={t("settings.elevation.autoElevate", "Tự nâng quyền khi mở app")}
          desc={t(
            "settings.elevation.autoElevateDesc",
            "Khi bật, app sẽ tự khởi động lại với quyền Administrator và hiện hộp thoại UAC. Cài đặt này dùng chung với mục “Yêu cầu quyền admin” ở trên."
          )}
          control={
            <Switch
              checked={status?.autoElevate ?? false}
              onChange={(v) => void setAutoElevate(v)}
              disabled={loading}
            />
          }
        />

        {!status?.isElevated && (
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/5 pt-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">
                {t("settings.elevation.restartNow", "Khởi động lại với quyền Admin")}
              </div>
              <div className="mt-0.5 text-xs text-ink-muted">
                {t(
                  "settings.elevation.restartNowDesc",
                  "Khởi động lại app ngay với quyền Administrator (hiện hộp thoại UAC)."
                )}
              </div>
            </div>
            <div className="shrink-0">
              <Button
                variant="secondary"
                onClick={() => void restartAsAdmin()}
                loading={loading}
              >
                <ShieldCheck className="h-4 w-4" />
                {t("settings.elevation.restart", "Nâng quyền")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// ── Tab: Monitor (refresh interval) ─────────────────────────────────────────
function MonitorTab({
  settings,
  patchMonitor,
}: {
  settings: AppSettings;
  patchMonitor: (p: Partial<AppSettings["monitor"]>) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card
      title={t("settings.monitor.title", "Realtime monitor")}
      subtitle={t(
        "settings.monitor.subtitle",
        "Tần suất cập nhật CPU/RAM/Net và thời gian lưu lịch sử."
      )}
    >
      <Row
        label={t("settings.monitor.refreshInterval", "Tần suất làm mới")}
        desc={t(
          "settings.monitor.refreshIntervalDesc",
          "1s mượt nhất nhưng tốn CPU hơn; 5s tiết kiệm pin."
        )}
        control={
          <Segmented
            value={String(settings.monitor.refreshIntervalMs) as "1000" | "2000" | "5000"}
            onChange={(v) =>
              patchMonitor({ refreshIntervalMs: Number(v) as 1000 | 2000 | 5000 })
            }
            options={[
              { value: "1000", label: "1s" },
              { value: "2000", label: "2s" },
              { value: "5000", label: "5s" },
            ]}
          />
        }
      />
      <Row
        label={t("settings.monitor.historyRetention", "Lưu lịch sử")}
        desc={t(
          "settings.monitor.historyRetentionDesc",
          "Sau khoảng này, chart sẽ bắt đầu ghi đè dữ liệu cũ."
        )}
        control={
          <Segmented
            value={String(settings.monitor.historyRetentionMin) as "5" | "15" | "30" | "60"}
            onChange={(v) =>
              patchMonitor({
                historyRetentionMin: Number(v) as 5 | 15 | 30 | 60,
              })
            }
            options={[
              { value: "5", label: "5 phút" },
              { value: "15", label: "15 phút" },
              { value: "30", label: "30 phút" },
              { value: "60", label: "1 giờ" },
            ]}
          />
        }
      />
    </Card>
  );
}

// ── Tab: About (UX-30) ──────────────────────────────────────────────────────
function AboutTab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {/* Auto-update panel (Task 11) */}
      <UpdatePanel />

      <Card
        title={t("settings.about.title", "Giới thiệu")}
        subtitle={t("settings.about.subtitle", "PC Manager Pro")}
      >
      <div className="flex items-center gap-4 pb-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient shadow-glow">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <div>
          <div className="text-lg font-semibold text-ink">PC Manager Pro</div>
          <div className="text-xs text-ink-muted">v0.1.0 · build dev</div>
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-ink-muted">
        <p>
          {t(
            "settings.about.description",
            "Trình quản lý & tối ưu Windows toàn diện, chạy cục bộ không cần cài đặt."
          )}
        </p>
        <p>
          {t("settings.about.stack", "Stack:")}{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">
            Tauri 2 · React 18 · TypeScript · Rust
          </code>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          variant="secondary"
          onClick={() => window.open("https://github.com/", "_blank", "noopener")}
        >
          <Github className="h-4 w-4" />
          {t("settings.about.viewOnGithub", "Xem trên GitHub")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            if (navigator.clipboard) {
              navigator.clipboard
                .writeText(
                  `PC Manager Pro v0.1.0\nUser-Agent: ${navigator.userAgent}\nPlatform: ${navigator.platform}`
                )
                .catch(() => undefined);
            }
          }}
        >
          <Cpu className="h-4 w-4" />
          {t("settings.about.copyDiagnostics", "Sao chép thông tin chẩn đoán")}
        </Button>
      </div>

      <div className="mt-4 rounded-md border border-white/5 bg-white/[0.02] p-3 text-[11px] text-ink-subtle">
        <p>
          © 2026 PC Manager Pro. {t("settings.about.license", "MIT License.")}
        </p>
      </div>
    </Card>
    </div>
  );
}

