import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/shared/components/Toast";
import type { ApplyResult } from "@/shared/types/system";

/** Nhóm chức năng của trang Thiết lập. */
export type SettingsGroup = "identity" | "personalization" | "power" | "activation";

/** Kết quả áp dụng + cờ cần restart, dùng chung cho mọi tab. */
export interface ApplyFeedback {
  result: ApplyResult;
}

/**
 * Hook gọi 1 Tauri command có trạng thái loading/error.
 *
 * Ngoài Tauri (chạy `npm run dev` thuần) command sẽ throw — ta bắt lỗi
 * và hiển thị ErrorState thay vì crash.
 */
export function useConfigCommand<T>(
  command: string,
  args?: Record<string, unknown>
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isTauri) {
        throw new Error(
          `Lệnh "${command}" chỉ chạy trong Tauri. Hãy dùng \`npm run tauri:dev\`.`
        );
      }
      const result = await invoke<T>(command, args);
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [command, JSON.stringify(args), isTauri]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, error, loading, refetch };
}

/**
 * Áp dụng 1 nhóm thiết lập và báo kết quả cho user.
 *
 * Hiển thị toast thành công/thất bại + ghi log chi tiết vào console để
 * dev có thể tra. Trả về `ApplyResult` để tab cập nhật lại dữ liệu.
 */
export async function applyConfig(
  command: string,
  patch: unknown
): Promise<ApplyResult | null> {
  try {
    const result = await invoke<ApplyResult>(command, { patch });
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.warning(result.message);
    }
    if (result.failed.length > 0) {
      console.warn(`[Thiết lập] ${command} thất bại một phần:`, result.failed);
    }
    if (result.requiresSignout) {
      toast.info("Một số thay đổi cần đăng xuất lại mới có hiệu lực đầy đủ.");
    }
    return result;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error(`Không áp dụng được: ${msg}`);
    return null;
  }
}
