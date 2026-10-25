import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Settings schema (khớp plan §1.16):
 *   ui          → theme, language, fontSize
 *   startup     → autoLaunch, minimizeToTray, checkUpdate
 *   notification→ enabled, sound
 *   security    → requireAdmin, pinLock
 *   monitor     → refreshIntervalMs, historyRetentionMin
 */
export interface AppSettings {
  ui: {
    theme: "dark" | "light" | "system";
    language: "vi" | "en";
    fontSize: number; // 12-18
  };
  startup: {
    autoLaunch: boolean;
    minimizeToTray: boolean;
    checkUpdate: boolean;
  };
  notification: {
    enabled: boolean;
    sound: boolean;
  };
  security: {
    requireAdmin: boolean;
    pinLock: boolean;
  };
  monitor: {
    refreshIntervalMs: 1000 | 2000 | 5000;
    historyRetentionMin: 5 | 15 | 30 | 60;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  ui: { theme: "dark", language: "vi", fontSize: 14 },
  startup: { autoLaunch: true, minimizeToTray: false, checkUpdate: true },
  notification: { enabled: true, sound: false },
  security: { requireAdmin: true, pinLock: false },
  monitor: { refreshIntervalMs: 2000, historyRetentionMin: 15 },
};

interface SettingsState {
  settings: AppSettings;
  setSettings: (next: AppSettings) => void;
  patchUi: (patch: Partial<AppSettings["ui"]>) => void;
  patchStartup: (patch: Partial<AppSettings["startup"]>) => void;
  patchNotification: (patch: Partial<AppSettings["notification"]>) => void;
  patchSecurity: (patch: Partial<AppSettings["security"]>) => void;
  patchMonitor: (patch: Partial<AppSettings["monitor"]>) => void;
  resetToDefaults: () => void;
}

/**
 * Persistence thông qua Zustand `persist` + `localStorage`.
 * Khi chạy trong Tauri, `tauri-plugin-store` lưu file JSON trong AppData.
 * Ở dev/web fallback về localStorage để không lỗi.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      setSettings: (next) => set({ settings: next }),
      patchUi: (patch) =>
        set((s) => ({ settings: { ...s.settings, ui: { ...s.settings.ui, ...patch } } })),
      patchStartup: (patch) =>
        set((s) => ({
          settings: { ...s.settings, startup: { ...s.settings.startup, ...patch } },
        })),
      patchNotification: (patch) =>
        set((s) => ({
          settings: { ...s.settings, notification: { ...s.settings.notification, ...patch } },
        })),
      patchSecurity: (patch) =>
        set((s) => ({
          settings: { ...s.settings, security: { ...s.settings.security, ...patch } },
        })),
      patchMonitor: (patch) =>
        set((s) => ({
          settings: { ...s.settings, monitor: { ...s.settings.monitor, ...patch } },
        })),
      resetToDefaults: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: "pc-manager-pro.settings.v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
