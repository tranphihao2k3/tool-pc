// UpdatePanel — UI component hiển thị trạng thái update + nút check/install.
// Đặt trong About tab của Settings.

import { Download, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { useUpdater } from "@/shared/lib/useUpdater";
import { useTranslation } from "react-i18next";

export function UpdatePanel() {
  const { t } = useTranslation();
  const { currentVersion, info, progress, isChecking, isInstalling, error, check, install } =
    useUpdater();

  // Auto-check lần đầu khi mount
  // (Không spam — chỉ 1 lần, không tự install)
  // Có thể tắt bằng cách remove useEffect dưới.
  // useEffect(() => { void check(); }, []); // Bật nếu muốn auto-check

  const showProgress = isInstalling && progress.message.length > 0;

  return (
    <Card
      title={t("settings.update.title", "Cập nhật")}
      subtitle={t(
        "settings.update.subtitle",
        "Tự động nâng cấp qua GitHub Releases"
      )}
    >
      {/* Row: current version + check button */}
      <div className="flex items-center justify-between gap-3 border-b border-white/5 py-3">
        <div>
          <div className="text-sm font-medium text-ink">
            {t("settings.update.currentVersion", "Phiên bản hiện tại")}
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">
              v{currentVersion ?? "…"}
            </code>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => void check()}
          disabled={isChecking}
        >
          {isChecking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isChecking
            ? t("settings.update.checking", "Đang kiểm tra…")
            : t("settings.update.check", "Kiểm tra cập nhật")}
        </Button>
      </div>

      {/* Status row */}
      {info && !isInstalling && (
        <div className="border-b border-white/5 py-3">
          {info.available ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-amber-400" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-amber-200">
                    {t("settings.update.available", "Có bản {{version}}", {
                      version: info.latestVersion,
                    })}
                  </div>
                  {info.pubDate && (
                    <div className="mt-0.5 text-[11px] text-ink-muted">
                      {t("settings.update.releasedAt", "Phát hành")}: {info.pubDate}
                    </div>
                  )}
                </div>
              </div>

              {info.notes && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-ink-muted hover:text-ink">
                    {t("settings.update.releaseNotes", "Ghi chú phát hành")}
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-[10px] text-ink-muted">
                    {info.notes}
                  </pre>
                </details>
              )}

              <div className="mt-3 flex justify-end">
                <Button
                  variant="primary"
                  onClick={() => void install()}
                  disabled={isInstalling}
                >
                  <Download className="h-4 w-4" />
                  {t("settings.update.download", "Tải và cài đặt")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              {t("settings.update.upToDate", "Bạn đang dùng bản mới nhất")}
            </div>
          )}
        </div>
      )}

      {/* Progress row */}
      {showProgress && (
        <div className="py-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-ink">
              {progress.stage === "downloading" && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("settings.update.downloading", "Đang tải xuống…")}
                </span>
              )}
              {progress.stage === "installing" && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("settings.update.installing", "Đang cài đặt…")}
                </span>
              )}
              {progress.stage === "finished" && (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("settings.update.finished", "Cập nhật xong. App sẽ tự khởi động lại.")}
                </span>
              )}
              {progress.stage === "failed" && (
                <span className="flex items-center gap-1.5 text-rose-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {t("settings.update.failed", "Cập nhật thất bại. Vui lòng thử lại sau.")}
                </span>
              )}
            </span>
            <span className="font-mono text-ink-muted">
              {progress.percent.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full transition-all duration-300 ${
                progress.stage === "failed"
                  ? "bg-rose-500"
                  : progress.stage === "finished"
                  ? "bg-emerald-500"
                  : "bg-brand"
              }`}
              style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
            />
          </div>
          {progress.message && (
            <p className="mt-1 text-[11px] text-ink-muted">{progress.message}</p>
          )}
        </div>
      )}

      {/* Error row */}
      {error && (
        <div className="py-3">
          <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Channel info */}
      <div className="mt-2 border-t border-white/5 pt-3 text-[11px] text-ink-subtle">
        {t("settings.update.channel", "Kênh cập nhật")}:{" "}
        {t("settings.update.channelGithub", "GitHub Releases")}
      </div>
    </Card>
  );
}
