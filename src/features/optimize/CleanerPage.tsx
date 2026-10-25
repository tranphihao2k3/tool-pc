import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import {
  Trash2,
  Search,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Recycle,
} from "lucide-react";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { ProgressBar } from "@/shared/components/ProgressBar";
import { ErrorState } from "@/shared/components/ErrorState";
import { formatBytes } from "@/shared/lib/utils";
import type {
  CleanCategory,
  CleanScanResult,
  CleanReport,
} from "@/shared/types/system";

export default function CleanerPage() {
  const { t } = useTranslation();
  const [scan, setScan] = useState<CleanScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cleaning, setCleaning] = useState(false);
  const [lastReport, setLastReport] = useState<CleanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-clear success
  useEffect(() => {
    if (success) {
      const id = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(id);
    }
  }, [success]);

  // Auto-clear error
  useEffect(() => {
    if (error) {
      const id = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(id);
    }
  }, [error]);

  const showError = (msg: string) => setError(msg);

  const handleScan = async () => {
    setScanning(true);
    setScanError(null);
    setLastReport(null);
    try {
      const result = await invoke<CleanScanResult>("scan_clean_targets", {
        categoryIds: null,
      });
      setScan(result);
      // Mặc định chọn tất cả category có file
      const autoSelect = new Set<string>();
      result.categories.forEach((c) => {
        if (c.fileCount > 0) autoSelect.add(c.id);
      });
      setSelected(autoSelect);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setScanError(msg);
    } finally {
      setScanning(false);
    }
  };

  const handleClean = async () => {
    if (!scan) return;
    if (selected.size === 0) {
      showError("Chưa chọn category nào");
      return;
    }
    setCleaning(true);
    setError(null);
    try {
      // Tách: recycle_bin dùng empty_recycle_bin; còn lại dùng delete_clean_targets
      const pathsToDelete: string[] = [];
      let recycleSelected = false;
      scan.categories.forEach((c) => {
        if (!selected.has(c.id)) return;
        if (c.id === "recycle_bin") {
          recycleSelected = true;
          return;
        }
        c.files
          .filter((f) => f.safeToDelete)
          .forEach((f) => pathsToDelete.push(f.path));
      });

      let totalReport: CleanReport = {
        success: true,
        deletedCount: 0,
        deletedSizeBytes: 0,
        failedCount: 0,
        failedPaths: [],
        durationMs: 0,
        log: [],
      };

      if (pathsToDelete.length > 0) {
        const r = await invoke<CleanReport>("delete_clean_targets", {
          paths: pathsToDelete,
        });
        totalReport = mergeReports(totalReport, r);
      }

      if (recycleSelected) {
        const r = await invoke<CleanReport>("empty_recycle_bin");
        totalReport = mergeReports(totalReport, r);
      }

      setLastReport(totalReport);
      setSuccess(
        `Đã xóa ${totalReport.deletedCount} file, giải phóng ${formatBytes(
          totalReport.deletedSizeBytes
        )}`
      );
      // Re-scan để cập nhật
      handleScan();
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setCleaning(false);
    }
  };

  const toggleCategory = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSelectedBytes = (scan?.categories ?? [])
    .filter((c) => selected.has(c.id))
    .reduce((sum, c) => sum + c.totalSizeBytes, 0);

  if (scanError && !scan) {
    return <ErrorState error={scanError} onRetry={handleScan} title="Lỗi quét" />;
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Header card */}
      <Card
        title={t("nav.cleaner", "Dọn rác")}
        subtitle="Quét & xóa file tạm, cache, recycle bin"
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleScan}
              loading={scanning}
              disabled={cleaning}
            >
              {scanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {scanning ? "Đang quét..." : "Quét"}
            </Button>
            {scan && (
              <Button
                variant="primary"
                onClick={handleClean}
                loading={cleaning}
                disabled={selected.size === 0}
              >
                <Trash2 className="h-4 w-4" />
                Dọn {selected.size} mục ({formatBytes(totalSelectedBytes)})
              </Button>
            )}
          </div>
        }
      >
        {!scan && !scanning && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Shield className="h-10 w-10 text-brand-200" />
            <div>
              <p className="text-sm text-ink">
                Nhấn <span className="font-semibold">Quét</span> để phát hiện file rác.
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Quét trong vài giây, hoàn toàn an toàn - chỉ liệt kê file sẽ xóa.
              </p>
            </div>
          </div>
        )}

        {scanning && !scan && (
          <div className="space-y-3 py-8">
            <ProgressBar value={50} tone="brand" />
            <p className="text-center text-xs text-ink-muted">
              Đang quét các thư mục Temp, Cache, Prefetch...
            </p>
          </div>
        )}

        {scan && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>
                Tìm thấy{" "}
                <span className="font-semibold text-ink">
                  {formatBytes(scan.totalSizeBytes)}
                </span>{" "}
                trong {scan.totalFileCount} file
              </span>
              <span>Quét mất {scan.durationMs}ms</span>
            </div>
            {scan.categories.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                checked={selected.has(cat.id)}
                onToggle={() => toggleCategory(cat.id)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Last report */}
      {lastReport && (
        <Card title="Kết quả dọn dẹp" subtitle={`${lastReport.durationMs}ms`}>
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Đã xóa" value={`${lastReport.deletedCount} file`} tone="success" />
              <Stat
                label="Giải phóng"
                value={formatBytes(lastReport.deletedSizeBytes)}
                tone="success"
              />
              <Stat
                label="Lỗi"
                value={`${lastReport.failedCount}`}
                tone={lastReport.failedCount > 0 ? "warning" : "muted"}
              />
            </div>
            {lastReport.failedPaths.length > 0 && (
              <details className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-warning">
                  {lastReport.failedPaths.length} file không xóa được
                </summary>
                <ul className="mt-2 space-y-1 font-mono text-[11px] text-ink-muted">
                  {lastReport.failedPaths.slice(0, 20).map((p, i) => (
                    <li key={i} className="truncate">
                      {p}
                    </li>
                  ))}
                  {lastReport.failedPaths.length > 20 && (
                    <li className="text-ink-subtle">
                      ... và {lastReport.failedPaths.length - 20} file nữa
                    </li>
                  )}
                </ul>
              </details>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  checked,
  onToggle,
}: {
  category: CleanCategory;
  checked: boolean;
  onToggle: () => void;
}) {
  const isEmpty = category.fileCount === 0;
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border p-3 transition ${
        isEmpty
          ? "border-white/5 bg-white/[0.01] opacity-50"
          : checked
          ? "border-brand bg-brand/10"
          : "border-white/5 bg-white/[0.02] hover:border-white/10"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={isEmpty}
          onChange={onToggle}
          className="h-4 w-4 rounded border-white/20 bg-white/5 text-brand focus:ring-brand"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {category.id === "recycle_bin" ? (
              <Recycle className="h-4 w-4 text-ink-muted" />
            ) : (
              <Trash2 className="h-4 w-4 text-ink-muted" />
            )}
            <span className="text-sm font-medium text-ink">{category.name}</span>
            {category.requiresAdmin && (
              <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                Cần admin
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">{category.description}</p>
        </div>
      </div>
      <div className="text-right text-xs">
        <div className="font-semibold text-ink">
          {isEmpty ? "—" : formatBytes(category.totalSizeBytes)}
        </div>
        <div className="text-ink-muted">{category.fileCount} file</div>
      </div>
    </label>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "muted";
}) {
  const colorMap = {
    success: "text-success",
    warning: "text-warning",
    muted: "text-ink-muted",
  };
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-2 text-center">
      <div className={`text-sm font-semibold ${colorMap[tone]}`}>{value}</div>
      <div className="text-[10px] text-ink-subtle">{label}</div>
    </div>
  );
}

function mergeReports(a: CleanReport, b: CleanReport): CleanReport {
  return {
    success: a.success && b.success,
    deletedCount: a.deletedCount + b.deletedCount,
    deletedSizeBytes: a.deletedSizeBytes + b.deletedSizeBytes,
    failedCount: a.failedCount + b.failedCount,
    failedPaths: [...a.failedPaths, ...b.failedPaths],
    durationMs: a.durationMs + b.durationMs,
    log: [...a.log, ...b.log],
  };
}
