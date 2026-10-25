import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import {
  Wrench,
  ShieldCheck,
  Activity,
  Globe,
  Database,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Clock,
} from "lucide-react";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { ProgressBar } from "@/shared/components/ProgressBar";
import { formatDuration } from "@/shared/lib/utils";
import type { RepairReport } from "@/shared/types/system";

type RepairKey = "sfc" | "dism_restore" | "dism_check" | "flush_dns" | "clear_logs";

interface RepairAction {
  key: RepairKey;
  command: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  duration: string;
  needsAdmin: boolean;
  invoke: string;
  resultKind: string;
}

const ACTIONS: RepairAction[] = [
  {
    key: "sfc",
    command: "sfc /scannow",
    title: "Quét SFC",
    description: "Kiểm tra & sửa file hệ thống Windows bị hỏng",
    icon: ShieldCheck,
    duration: "5-15 phút",
    needsAdmin: true,
    invoke: "run_sfc_scan",
    resultKind: "SfcScan",
  },
  {
    key: "dism_restore",
    command: "DISM /Online /Cleanup-Image /RestoreHealth",
    title: "DISM RestoreHealth",
    description: "Tải file thay thế từ Windows Update để sửa component store",
    icon: Wrench,
    duration: "10-30 phút",
    needsAdmin: true,
    invoke: "run_dism_restore_health",
    resultKind: "DismRestoreHealth",
  },
  {
    key: "dism_check",
    command: "DISM /Online /Cleanup-Image /CheckHealth",
    title: "DISM CheckHealth",
    description: "Chỉ kiểm tra, không sửa (an toàn, nhanh)",
    icon: Activity,
    duration: "1-2 phút",
    needsAdmin: false,
    invoke: "run_dism_check_health",
    resultKind: "DismCheckHealth",
  },
  {
    key: "flush_dns",
    command: "ipconfig /flushdns",
    title: "Flush DNS",
    description: "Xóa cache DNS - sửa lỗi không vào được web",
    icon: Globe,
    duration: "< 5 giây",
    needsAdmin: false,
    invoke: "flush_dns",
    resultKind: "FlushDns",
  },
  {
    key: "clear_logs",
    command: "wevtutil cl Application/System/Security",
    title: "Clear Event Logs",
    description: "Xóa nhật ký sự kiện Windows (Application, System, Security)",
    icon: Database,
    duration: "10-30 giây",
    needsAdmin: true,
    invoke: "clear_event_logs",
    resultKind: "ClearEventLogs",
  },
];

export default function RepairPage() {
  const { t } = useTranslation();
  const [busyKey, setBusyKey] = useState<RepairKey | null>(null);
  const [reports, setReports] = useState<Record<string, RepairReport>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const id = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(id);
    }
  }, [error]);

  const handleRun = async (action: RepairAction) => {
    setBusyKey(action.key);
    setError(null);
    try {
      const r = await invoke<RepairReport>(action.invoke);
      setReports((prev) => ({ ...prev, [action.key]: r }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <Card
        title={t("nav.repair", "Sửa lỗi Windows")}
        subtitle="Công cụ sửa chữa hệ thống tích hợp sẵn của Windows"
      >
        <div className="space-y-2">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            const report = reports[action.key];
            const isBusy = busyKey === action.key;
            return (
              <div
                key={action.key}
                className="rounded-md border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-200" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">
                          {action.title}
                        </span>
                        <code className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-ink-muted">
                          {action.command}
                        </code>
                        {action.needsAdmin && (
                          <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                            Cần admin
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[10px] text-ink-subtle">
                          <Clock className="h-3 w-3" /> {action.duration}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        {action.description}
                      </p>

                      {/* Report inline */}
                      {report && !isBusy && (
                        <div
                          className={`mt-2 rounded-md border p-2 text-xs ${
                            report.success
                              ? "border-success/30 bg-success/5"
                              : "border-danger/30 bg-danger/5"
                          }`}
                        >
                          <div
                            className={`flex items-center gap-1.5 font-medium ${
                              report.success ? "text-success" : "text-danger"
                            }`}
                          >
                            {report.success ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <AlertTriangle className="h-3 w-3" />
                            )}
                            {report.message}
                          </div>
                          <div className="mt-1 text-[11px] text-ink-muted">
                            {formatDuration(report.durationMs)}
                            {report.exitCode !== null &&
                              ` · exit ${report.exitCode}`}
                          </div>
                          {report.summary && (
                            <div className="mt-1 text-[11px] text-ink-muted">
                              {report.summary}
                            </div>
                          )}
                        </div>
                      )}

                      {isBusy && (
                        <div className="mt-2 space-y-1.5">
                          <ProgressBar value={50} tone="brand" />
                          <p className="text-[11px] text-ink-muted">
                            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                            Đang chạy {action.command}...
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant={action.needsAdmin ? "secondary" : "primary"}
                    onClick={() => handleRun(action)}
                    loading={isBusy}
                    disabled={busyKey !== null}
                    className="shrink-0"
                  >
                    {isBusy ? "Đang chạy" : "Chạy"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-md border border-info/20 bg-info/5 p-3 text-xs text-ink-muted">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <div>
              <p className="font-medium text-ink">Lưu ý về quyền admin</p>
              <p className="mt-1">
                Các lệnh cần admin sẽ thất bại nếu app không chạy với quyền
                administrator. Hãy đóng app, chuột phải vào shortcut →{' '}
                <span className="font-mono">Run as administrator</span>.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
