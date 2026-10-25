// Logger helper — wraps tauri-plugin-log ở runtime, fallback console.log ở dev.
//
// 3 levels: info / warn / error. Mỗi log ghi:
//   - Console (always)
//   - File ở AppData/Roaming/com.pcmanager.pro/logs/ (qua plugin-log ở prod)
//
// plugin-log path mặc định: %APPDATA%\<identifier>\logs\<app>.log (rotated daily).

import type { ErrorInfo } from "react";

type LogLevel = "info" | "warn" | "error";

interface FrontendLogPayload {
  level: LogLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

/** Ghi 1 dòng log ra plugin-log (Rust) + console. */
async function writeLog(payload: FrontendLogPayload): Promise<void> {
  // Console always — dễ debug trong DevTools
  const fn =
    payload.level === "error"
      ? console.error
      : payload.level === "warn"
      ? console.warn
      : console.info;
  fn(`[${payload.scope}] ${payload.message}`, payload.meta ?? "");

  // Rust side (best-effort, không throw nếu fail)
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("frontend_log", { payload });
    } catch {
      // Ignore — không muốn log làm crash app
    }
  }
}

export const log = {
  info: (scope: string, message: string, meta?: Record<string, unknown>) =>
    void writeLog({ level: "info", scope, message, meta }),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) =>
    void writeLog({ level: "warn", scope, message, meta }),
  error: (scope: string, message: string, meta?: Record<string, unknown>) =>
    void writeLog({ level: "error", scope, message, meta }),
};

/** Convenience cho ErrorBoundary. */
export function captureError(scope: string, error: Error, info?: ErrorInfo): void {
  void writeLog({
    level: "error",
    scope,
    message: `${error.name}: ${error.message}`,
    meta: {
      stack: error.stack,
      componentStack: info?.componentStack,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    },
  });
}
