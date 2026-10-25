import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format bytes sang GB/TB chính xác (chia cho 1024^3, đúng như Windows Explorer). */
export function formatBytes(bytes: number | null | undefined, decimals = 2): string {
  if (!bytes || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(decimals)} ${units[i]}`;
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null || isNaN(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

export function formatMHz(mhz: number | null | undefined): string {
  if (!mhz) return "—";
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(2)} GHz`;
  return `${mhz} MHz`;
}

/** Format milliseconds sang dạng dễ đọc: "1.5s", "2m 30s", "1h 15m". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${(ms / 1000).toFixed(sec < 10 ? 1 : 0)}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const hour = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hour}h ${remMin}m` : `${hour}h`;
}

/**
 * Format tốc độ byte/giây sang đơn vị dễ đọc.
 * - `bps` là bytes PER SECOND (không phải bit).
 * - Dùng 1024-based như `formatBytes` để nhất quán với Explorer.
 */
export function formatBytesPerSec(bps: number | null | undefined): string {
  if (bps == null || !isFinite(bps) || bps < 0) return "—";
  if (bps < 1) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let i = 0;
  let v = bps;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

/** Format tần số CPU (MHz) → "3.80 GHz" / "800 MHz". */
export function formatCpuClock(mhz: number | null | undefined): string {
  if (!mhz || mhz <= 0) return "—";
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(2)} GHz`;
  return `${mhz} MHz`;
}

/**
 * Trích message từ lỗi trả về từ Tauri command.
 *
 * Rust `AppError` serialize thành `{ type, message }` (tag = "type",
 * content = "message"), nên `String(e)` sẽ ra `[object Object]`.
 * Hàm này ưu tiên `e.message`, sau đó tới `e.content`, rồi mới fallback
 * sang `String(e)`.
 */
export function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const obj = e as { message?: unknown; content?: unknown };
    if (typeof obj.message === "string" && obj.message) return obj.message;
    if (typeof obj.content === "string" && obj.content) return obj.content;
  }
  return String(e);
}
