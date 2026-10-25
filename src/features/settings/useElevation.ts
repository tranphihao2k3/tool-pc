import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { log } from "@/shared/lib/log";
import { toast } from "@/shared/components/Toast";
import { extractErrorMessage } from "@/shared/lib/utils";
import type { ElevationStatus } from "@/shared/types/system";

/**
 * Hook quản lý trạng thái quyền Administrator của app.
 *
 * Backend (`src-tauri/src/elevation.rs`) tự nâng quyền khi mở app nếu
 * cờ `autoElevate` đang bật. Ở đây chỉ:
 *   - đọc trạng thái hiện tại để hiển thị badge trên topbar,
 *   - bật/tắt cờ,
 *   - khởi động lại app với quyền admin theo yêu cầu.
 */
export function useElevation() {
  const [status, setStatus] = useState<ElevationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const refresh = useCallback(async () => {
    if (!isTauri) return;
    try {
      const result = await invoke<ElevationStatus>("get_elevation_status");
      setStatus(result);
      setError(null);
    } catch (e: unknown) {
      const msg = extractErrorMessage(e);
      setError(msg);
      log.error("Elevation", "Không đọc được trạng thái quyền", { msg });
    }
  }, [isTauri]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Bật/tắt cờ tự nâng quyền khi mở app. */
  const setAutoElevate = useCallback(
    async (enabled: boolean) => {
      if (!isTauri) return;
      setLoading(true);
      try {
        const result = await invoke<ElevationStatus>("set_auto_elevate", {
          enabled,
        });
        setStatus(result);
        setError(null);
        toast.success(
          enabled
            ? "Đã bật tự nâng quyền Administrator khi mở app."
            : "Đã tắt tự nâng quyền. App sẽ chạy với quyền của user hiện tại."
        );
        log.info("Elevation", `auto_elevate = ${enabled}`);
      } catch (e: unknown) {
        const msg = extractErrorMessage(e);
        setError(msg);
        toast.error(`Không lưu được cài đặt: ${msg}`);
        log.error("Elevation", "Lỗi khi bật/tắt auto elevate", { msg });
      } finally {
        setLoading(false);
      }
    },
    [isTauri]
  );

  /** Khởi động lại app với quyền Administrator (hiện hộp thoại UAC). */
  const restartAsAdmin = useCallback(async () => {
    if (!isTauri) return;
    setLoading(true);
    try {
      await invoke("restart_as_admin");
      // Tiến trình hiện tại sẽ thoát sau khi spawn bản elevated.
    } catch (e: unknown) {
      const msg = extractErrorMessage(e);
      setError(msg);
      toast.error(`Không khởi động lại được: ${msg}`);
      log.error("Elevation", "Lỗi khi restart as admin", { msg });
      setLoading(false);
    }
  }, [isTauri]);

  return { status, loading, error, refresh, setAutoElevate, restartAsAdmin };
}
