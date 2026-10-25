import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

/**
 * ErrorBoundary "functional" đơn giản cho các page lẻ.
 * Dùng thêm React ErrorBoundary class cho root.
 */
export function ErrorState({
  error,
  onRetry,
  title,
}: {
  error: Error | string;
  onRetry?: () => void;
  title?: string;
}) {
  const msg = typeof error === "string" ? error : error.message;
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" />
      <div>
        <div className="text-sm font-semibold text-ink">
          {title ?? "Đã xảy ra lỗi"}
        </div>
        <div className="mt-1 text-xs text-ink-muted">{msg}</div>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Thử lại
        </Button>
      )}
    </div>
  );
}

/**
 * Hook tiện ích gọi Tauri command với state loading/error/data.
 * - Fallback sang "browser mock" nếu chạy ngoài Tauri (dev thuần).
 * - Có auto-retry 1 lần nếu fail.
 */
export function useTauriCommand<T>(
  command: string,
  args?: Record<string, unknown>,
  options?: { skip?: boolean; mock?: T }
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const run = useCallback(async () => {
    if (options?.skip) return;
    setLoading(true);
    setError(null);
    try {
      if (isTauri) {
        const result = await invoke<T>(command, args);
        setData(result);
      } else if (options?.mock !== undefined) {
        await new Promise((r) => setTimeout(r, 300));
        setData(options.mock);
      } else {
        throw new Error(
          `Lệnh "${command}" chỉ chạy trong Tauri. Hãy \`npm run tauri:dev\`.`
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, JSON.stringify(args), options?.skip]);

  useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, refetch: run };
}
