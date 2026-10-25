import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { ErrorState } from "@/shared/components/ErrorState";
import { toast } from "@/shared/components/Toast";
import { useConfigCommand } from "./useConfigCommand";
import { KeyRound, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";
import type { ActivationStatus } from "@/shared/types/system";

/**
 * Tab Kích hoạt — chỉ ĐỌC trạng thái license Windows.
 *
 * Cố ý KHÔNG cung cấp chức năng cài key: mọi thao tác kích hoạt Windows
 * đều cần key hợp lệ và nên đi qua Settings → Update → Activation của
 * Microsoft để không vi phạm điều khoản.
 */
export default function ActivationTab() {
  const { data, error, loading, refetch } = useConfigCommand<ActivationStatus>(
    "get_activation_status"
  );

  if (error && !data) {
    return (
      <ErrorState
        error={error}
        onRetry={refetch}
        title="Không tải được trạng thái kích hoạt"
      />
    );
  }

  if (!data) {
    return (
      <Card>
        <div className="py-8 text-center text-sm text-ink-muted">
          {loading ? "Đang tải…" : "Chưa có dữ liệu"}
        </div>
      </Card>
    );
  }

  const activated = data.activated;

  return (
    <div className="space-y-6">
      <Card
        title="Kích hoạt"
        subtitle="Trạng thái kích hoạt Windows của máy này"
        action={
          <Button variant="secondary" onClick={refetch} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Làm mới
          </Button>
        }
      >
        <div
          className={`flex items-center gap-3 rounded-lg border p-4 ${
            activated
              ? "border-success/30 bg-success/10"
              : "border-danger/30 bg-danger/10"
          }`}
        >
          {activated ? (
            <ShieldCheck className="h-6 w-6 shrink-0 text-success" />
          ) : (
            <ShieldAlert className="h-6 w-6 shrink-0 text-danger" />
          )}
          <div className="min-w-0">
            <div
              className={`text-sm font-semibold ${
                activated ? "text-success" : "text-danger"
              }`}
            >
              {activated ? "Windows đã được kích hoạt" : "Windows chưa kích hoạt"}
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">{data.description}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
            <dt className="text-ink-muted">Mã trạng thái</dt>
            <dd className="text-right font-medium text-ink">
              {data.statusCode}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
            <dt className="text-ink-muted">Khóa sản phẩm</dt>
            <dd className="text-right font-mono text-xs text-ink">
              {data.partialProductKey
                ? `•••••-${data.partialProductKey}`
                : "—"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
            <dt className="text-ink-muted">Thời hạn chấp nhận</dt>
            <dd className="text-right font-medium text-ink">
              {data.gracePeriodDays != null
                ? `${data.gracePeriodDays} ngày`
                : "—"}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-ink-muted">
          Để kích hoạt hoặc thay đổi key, hãy mở{" "}
          <span className="text-ink">Cài đặt → Cập nhật Windows → Kích hoạt</span>{" "}
          trong Windows.
        </p>
      </Card>

      <Card
        title="Khoá sản phẩm"
        subtitle="Nhập khóa Windows 25 ký tự để kích hoạt máy"
      >
        <p className="text-sm text-ink-muted">
          PC Manager Pro chỉ đọc trạng thái kích hoạt và không gửi khóa sản
          phẩm lên máy chủ nào — mọi thao tác diễn ra cục bộ.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() =>
            toast.info(
              "Hãy dùng Cài đặt Windows → Cập nhật → Kích hoạt để nhập khóa sản phẩm."
            )
          }
        >
          <KeyRound className="h-4 w-4" /> Mở hướng dẫn kích hoạt
        </Button>
      </Card>
    </div>
  );
}
