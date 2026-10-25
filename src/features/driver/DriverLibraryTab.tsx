import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Save,
  FolderOpen,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  MonitorSmartphone,
  HardDriveDownload,
  RotateCcw,
  Search,
} from "lucide-react";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { formatBytes, formatDuration } from "@/shared/lib/utils";
import type {
  MachineProfile,
  LibraryGroupStat,
  LibraryBackupReport,
  DriverRestoreReport,
} from "@/shared/types/system";

/**
 * Tab "Thư viện driver" — lưu trữ driver theo **HÃNG / DÒNG MÁY**.
 *
 * Mục tiêu: backup driver 1 lần, lưu theo danh mục hãng + dòng (vd
 * `ACER/Nitro 5`, `ASUS/TUF Gaming`, `HP/Gaming`) để khi cài máy mới cùng
 * dòng, phần mềm tự truy vấn đúng nhóm và khôi phục.
 */
export default function DriverLibraryTab() {
  const { t } = useTranslation();
  const [libraryDir, setLibraryDir] = useState<string>(
    "C:\\Users\\Public\\Documents\\PCManagerPro\\Drivers"
  );
  const [profile, setProfile] = useState<MachineProfile | null>(null);
  const [groups, setGroups] = useState<LibraryGroupStat[]>([]);
  const [preview, setPreview] = useState<LibraryGroupStat[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [report, setReport] = useState<LibraryBackupReport | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (error) {
      const id = setTimeout(() => setError(null), 7000);
      return () => clearTimeout(id);
    }
  }, [error]);

  useEffect(() => {
    if (successMsg) {
      const id = setTimeout(() => setSuccessMsg(null), 5000);
      return () => clearTimeout(id);
    }
  }, [successMsg]);

  // Lấy hồ sơ máy (hãng + dòng) khi mở tab.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await invoke<MachineProfile>("get_machine_profile");
        if (!cancelled) setProfile(p);
      } catch {
        // Không xác định được máy → vẫn dùng được chức năng backup.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Nghe tiến trình export realtime từ backend.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const fn = await listen<string>("driver-backup-progress", (e) => {
          setProgress(e.payload);
        });
        unlisten = fn;
      } catch {
        // Không chạy trong Tauri → bỏ qua.
      }
    })();
    return () => unlisten?.();
  }, []);

  const scan = useCallback(async () => {
    if (!libraryDir.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const g = await invoke<LibraryGroupStat[]>("scan_driver_library", {
        libraryDir: libraryDir.trim(),
      });
      setGroups(g);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, [libraryDir]);

  // Quét thư viện khi mở tab.
  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Xem trước cách phân loại (không ghi file).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await invoke<LibraryGroupStat[]>("preview_driver_library");
        if (!cancelled) setPreview(g);
      } catch {
        // Bỏ qua — preview chỉ là thông tin phụ.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBackup = async () => {
    if (!libraryDir.trim()) {
      setError("Vui lòng nhập folder thư viện");
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    setProgress("");
    try {
      const result = await invoke<LibraryBackupReport>("backup_driver_library", {
        libraryDir: libraryDir.trim(),
      });
      setReport(result);
      setSuccessMsg(
        `Đã backup ${result.exportedCount} driver vào thư viện theo hãng/dòng`
      );
      await scan();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const handleOpenFolder = async () => {
    if (!libraryDir.trim()) return;
    try {
      await invoke("open_backup_folder", { path: libraryDir.trim() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRestore = async (groupPath: string) => {
    try {
      const r = await invoke<DriverRestoreReport>(
        "restore_driver_library_group",
        { libraryDir: libraryDir.trim(), groupPath }
      );
      setSuccessMsg(
        `Đã khôi phục ${r.addedCount} driver mới (${r.alreadyPresentCount} đã có sẵn)`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(null);
    }
  };

  // Lọc theo tên hãng/dòng.
  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.path.toLowerCase().includes(q));
  }, [groups, filter]);

  const currentSubdir = profile
    ? `${profile.brand}/${profile.series}`
    : "";

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Hồ sơ máy */}
      {profile && (
        <Card
          title={t("driver.library.profileTitle", "Máy hiện tại")}
          subtitle={t(
            "driver.library.profileDesc",
            "Driver sẽ được lưu theo hãng và dòng sản phẩm, dùng chung cho mọi máy cùng dòng"
          )}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ProfileStat
              icon={MonitorSmartphone}
              label={t("driver.library.brand", "Hãng")}
              value={profile.brand}
            />
            <ProfileStat
              icon={Layers}
              label={t("driver.library.series", "Dòng sản phẩm")}
              value={profile.series}
              highlight
            />
            <ProfileStat
              icon={Package}
              label={t("driver.library.model", "Model")}
              value={profile.model || "—"}
            />
            <ProfileStat
              icon={HardDriveDownload}
              label={t("driver.library.target", "Thư mục đích")}
              value={currentSubdir || "—"}
              mono
            />
          </div>
          {profile.family && profile.family !== profile.series && (
            <p className="mt-3 text-xs text-ink-subtle">
              {t("driver.library.familyHint", "Họ sản phẩm gốc")}: {profile.family}
            </p>
          )}
        </Card>
      )}

      {/* Backup */}
      <Card
        title={t("driver.library.backupTitle", "Backup vào thư viện")}
        subtitle={t(
          "driver.library.backupDesc",
          "Tự động chia nhóm theo hãng / dòng máy. Driver dùng chung (Intel, NVIDIA…) nằm trong Common."
        )}
      >
        <div className="mb-4">
          <label className="mb-1.5 block text-xs text-ink-muted">
            {t("driver.library.libraryDir", "Thư viện driver")}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={libraryDir}
              onChange={(e) => setLibraryDir(e.target.value)}
              placeholder="C:\Users\Public\Documents\PCManagerPro\Drivers"
              className="flex-1 rounded-md border border-white/10 bg-bg-100 px-3 py-1.5 font-mono text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
            />
            <Button variant="secondary" onClick={handleOpenFolder} disabled={!libraryDir.trim()}>
              <FolderOpen className="h-4 w-4" />
              {t("driver.backup.open", "Mở")}
            </Button>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="mb-4 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink">
              <Search className="h-3.5 w-3.5" />
              {t("driver.library.preview", "Xem trước cách phân loại")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {preview.map((g) => (
                <span
                  key={g.path}
                  className={`rounded-md border px-2 py-1 font-mono text-[11px] ${
                    g.matchesCurrent
                      ? "border-brand/40 bg-brand/10 text-brand-100"
                      : "border-white/10 bg-white/[0.03] text-ink-muted"
                  }`}
                >
                  {g.path}
                  <span className="ml-1.5 opacity-70">({g.driverCount})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={handleBackup} loading={busy} disabled={!libraryDir.trim()}>
            <Save className="h-4 w-4" />
            {t("driver.library.startBackup", "Backup theo hãng / dòng")}
          </Button>
          {busy && progress && (
            <span className="font-mono text-xs text-ink-muted">{progress}</span>
          )}
        </div>
      </Card>

      {/* Kết quả */}
      {report && (
        <Card title={t("driver.library.reportTitle", "Kết quả backup")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ReportStat
              label={t("driver.library.exported", "Driver đã lưu")}
              value={String(report.exportedCount)}
              tone="success"
            />
            <ReportStat
              label={t("driver.library.groups", "Nhóm")}
              value={String(report.groups.length)}
              tone="info"
            />
            <ReportStat
              label={t("driver.backup.size", "Tổng dung lượng")}
              value={formatBytes(report.totalSizeBytes)}
            />
            <ReportStat
              label={t("driver.backup.duration", "Thời gian")}
              value={formatDuration(report.durationMs)}
            />
          </div>
          {report.failedCount > 0 && (
            <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
              {report.failedCount} driver lỗi: {report.failures.slice(0, 3).join("; ")}
            </div>
          )}
        </Card>
      )}

      {/* Thư viện hiện có */}
      <Card
        title={t("driver.library.libraryTitle", "Thư viện hiện có")}
        subtitle={t(
          "driver.library.libraryDesc",
          "Chọn nhóm đúng dòng máy để khôi phục driver"
        )}
        action={
          <Button
            variant="ghost"
            onClick={scan}
            loading={scanning}
            aria-label={t("driver.library.refresh", "Làm mới")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      >
        <div className="mb-3">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("driver.library.search", "Tìm hãng hoặc dòng máy…")}
            className="w-full rounded-md border border-white/10 bg-bg-100 px-3 py-1.5 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
          />
        </div>

        {filteredGroups.length === 0 ? (
          <div className="rounded-md border border-white/5 bg-white/[0.02] p-6 text-center text-sm text-ink-muted">
            {t(
              "driver.library.empty",
              "Chưa có thư viện driver nào. Chạy backup để tạo."
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredGroups.map((g) => {
              const isCurrent = g.matchesCurrent;
              return (
                <div
                  key={g.path}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                    isCurrent
                      ? "border-brand/30 bg-brand/[0.07]"
                      : "border-white/5 bg-white/[0.02]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm text-ink">
                        {g.path}
                      </span>
                      {isCurrent && (
                        <span className="shrink-0 rounded border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-100">
                          {t("driver.library.current", "Máy này")}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-subtle">
                      {g.driverCount} {t("driver.library.drivers", "driver")} ·{" "}
                      {formatBytes(g.sizeBytes)}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setRestoring(g.path)}
                    loading={restoring === g.path}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("driver.library.restore", "Khôi phục")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        title={t("driver.library.howTo", "Cách dùng")}
        subtitle={t("driver.library.howToDesc", "Backup 1 lần, dùng lại cho cả dòng máy")}
      >
        <ol className="space-y-2 text-sm text-ink-muted">
          <li className="flex gap-2">
            <span className="text-brand-200">1.</span>
            {t(
              "driver.library.step1",
              "Backup trên 1 máy đại diện của dòng (vd Acer Nitro 5) → lưu vào ACER/Nitro 5"
            )}
          </li>
          <li className="flex gap-2">
            <span className="text-brand-200">2.</span>
            {t(
              "driver.library.step2",
              "Driver chung cho mọi máy (Intel, NVIDIA, Realtek) tự vào Common/<lớp thiết bị>"
            )}
          </li>
          <li className="flex gap-2">
            <span className="text-brand-200">3.</span>
            {t(
              "driver.library.step3",
              "Trên máy mới cùng dòng, mở tab này → nhóm của dòng đó được đánh dấu 'Máy này'"
            )}
          </li>
          <li className="flex gap-2">
            <span className="text-brand-200">4.</span>
            {t(
              "driver.library.step4",
              "Bấm Khôi phục → driver được cài vào Windows (cần quyền Administrator)"
            )}
          </li>
        </ol>
      </Card>
    </div>
  );
}

function ProfileStat({
  icon: Icon,
  label,
  value,
  highlight,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight
          ? "border-brand/30 bg-brand/[0.07]"
          : "border-white/5 bg-white/[0.02]"
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-ink-subtle">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div
        className={`truncate text-sm font-semibold text-ink ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ReportStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "success" | "info";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "info"
        ? "text-info"
        : "text-ink";
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-3">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-ink-subtle">{label}</div>
    </div>
  );
}
