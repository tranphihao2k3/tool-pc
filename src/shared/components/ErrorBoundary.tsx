// ErrorBoundary — bắt lỗi render của React tree, hiển thị fallback UI thân thiện
// và log error ra log file (AppData) thông qua plugin-log (nếu có).
//
// Đặt ở đầu React tree trong main.tsx, bao bọc toàn bộ <App />. Mỗi feature
// page cũng có thể bọc riêng để cách ly lỗi (vd: 1 tab crash không kéo sập app).

import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "@/locales/i18n";
import { AlertTriangle, RotateCcw, Home, Copy } from "lucide-react";
import { Button } from "./Button";
import { captureError } from "@/shared/lib/log";

interface Props {
  children: ReactNode;
  /** Hiển thị full-page fallback (mặc định) hoặc inline. */
  variant?: "page" | "inline";
  /** Label cho scope để log rõ ràng hơn (vd: "Dashboard", "Cleaner"). */
  scope?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to file (best-effort) — không throw nếu log fail
    const scope = this.props.scope ?? "App";
    console.error(`[${scope}] Uncaught error:`, error, errorInfo);
    void captureError(scope, error, errorInfo);

    this.setState({ errorInfo });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleHome = (): void => {
    window.location.href = "/dashboard";
  };

  private handleCopy = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    if (!error) return;
    const text = [
      `Scope: ${this.props.scope ?? "App"}`,
      `Error: ${error.name}: ${error.message}`,
      `Stack: ${error.stack ?? "(no stack)"}`,
      `Component stack: ${errorInfo?.componentStack ?? "(none)"}`,
      `User agent: ${navigator.userAgent}`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // ignore
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error } = this.state;
    const { variant = "page", scope = "App" } = this.props;
    const isInline = variant === "inline";

    const Fallback = (
      <div
        role="alert"
        aria-live="assertive"
        className={
          isInline
            ? "rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
            : "flex h-full min-h-[60vh] flex-col items-center justify-center px-6 text-center"
        }
      >
        {!isInline && (
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-rose-500/15 text-rose-400">
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
        <h2
          className={
            isInline
              ? "mb-1 text-sm font-semibold text-rose-200"
              : "mb-2 text-lg font-semibold text-ink"
          }
        >
          {isInline
            ? i18n.t("settings.errorBoundary.title", "Đã xảy ra lỗi")
            : i18n.t("settings.errorBoundary.titleFull", "Đã xảy ra lỗi không mong muốn", {
                scope: scope,
              })}
        </h2>
        <p
          className={
            isInline
              ? "text-xs text-rose-300/80"
              : "mb-4 max-w-md text-sm text-ink-muted"
          }
        >
          {isInline
            ? i18n.t(
                "settings.errorBoundary.inline",
                "Phần này tạm thời không khả dụng. Các phần khác của app vẫn hoạt động bình thường."
              )
            : i18n.t(
                "settings.errorBoundary.page",
                "Lỗi đã được ghi lại. Bạn có thể thử tải lại trang hoặc quay về Dashboard."
              )}
        </p>

        {error && !isInline && (
          <pre
            tabIndex={0}
            className="mb-6 max-h-40 max-w-2xl overflow-auto rounded-md border border-white/5 bg-black/30 px-4 py-3 text-left text-[11px] text-rose-200/80"
            aria-label={i18n.t("settings.errorBoundary.errorDetails", "Chi tiết lỗi")}
          >
            <code>
              {error.name}: {error.message}
              {error.stack ? `\n\n${error.stack.split("\n").slice(0, 8).join("\n")}` : ""}
            </code>
          </pre>
        )}

        {!isInline && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" onClick={this.handleReload}>
              <RotateCcw className="h-4 w-4" />
              {i18n.t("settings.errorBoundary.reload", "Tải lại trang")}
            </Button>
            <Button variant="secondary" onClick={this.handleHome}>
              <Home className="h-4 w-4" />
              {i18n.t("settings.errorBoundary.home", "Về Dashboard")}
            </Button>
            <Button variant="secondary" onClick={this.handleCopy}>
              <Copy className="h-4 w-4" />
              {this.state.copied
                ? i18n.t("settings.errorBoundary.copied", "Đã sao chép!")
                : i18n.t("settings.errorBoundary.copy", "Sao chép chi tiết")}
            </Button>
          </div>
        )}
      </div>
    );

    return Fallback;
  }
}
