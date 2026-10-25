import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, ShieldCheck, Zap, Globe } from "lucide-react";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";

const STORAGE_KEY = "pcmp.onboarded.v1";

/**
 * Onboarding gồm 4 bước (clone UX-1 → UX-4):
 * 1. Welcome
 * 2. Quyền admin
 * 3. Quét nhanh phần cứng
 * 4. Sẵn sàng
 *
 * Lưu state vào localStorage để lần sau vào thẳng Dashboard.
 */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  const step =
    Number(new URLSearchParams(window.location.search).get("step") || "1") ||
    1;

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient shadow-glow">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-xl font-semibold text-ink">{t("app.name")}</div>
            <div className="text-xs text-ink-muted">{t("app.tagline")}</div>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                s <= step ? "bg-brand-gradient" : "bg-white/5"
              }`}
            />
          ))}
        </div>

        {step === 1 && <Step1 />}
        {step === 2 && <Step2 />}
        {step === 3 && <Step3 />}
        {step === 4 && <Step4 onFinish={finish} />}

        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(`/onboarding?step=${Math.max(1, step - 1)}`)}
            disabled={step === 1}
          >
            Quay lại
          </Button>
          {step < 4 ? (
            <Button onClick={() => navigate(`/onboarding?step=${step + 1}`)}>
              Tiếp tục
            </Button>
          ) : (
            <Button onClick={finish}>Bắt đầu sử dụng</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step1() {
  return (
    <Card className="text-center" glow>
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient-soft">
        <Zap className="h-8 w-8 text-brand-200" />
      </div>
      <h2 className="text-2xl font-semibold text-ink">Chào mừng bạn</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        PC Manager Pro giúp bạn xem thông tin phần cứng, dọn rác, tăng tốc và bảo
        vệ máy tính Windows. Tất cả chạy cục bộ — không gửi dữ liệu lên mây.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Feature icon={ShieldCheck} title="An toàn" desc="Không cần cài đặt" />
        <Feature icon={Zap} title="Nhanh" desc="Tối ưu 1 cú click" />
        <Feature icon={Globe} title="Tiếng Việt" desc="Giao diện thân thiện" />
      </div>
    </Card>
  );
}

function Step2() {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-ink">Quyền quản trị</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Một số chức năng (sửa file hệ thống, thay đổi service, cập nhật driver)
        cần quyền Admin. App sẽ tự động xin quyền khi cần.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-ink">
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-success" />
          <span>Đọc thông tin phần cứng (WMI)</span>
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-success" />
          <span>Đọc Registry HKLM/HKCU</span>
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-success" />
          <span>Chạy lệnh hệ thống (sfc, dism, pnputil…)</span>
        </li>
      </ul>
    </Card>
  );
}

function Step3() {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-ink">Đang quét phần cứng…</h2>
      <p className="mt-2 text-sm text-ink-muted">
        App sẽ thu thập thông tin CPU, RAM, Mainboard, ổ đĩa, GPU và mạng để
        hiển thị ở Dashboard. Quá trình mất khoảng 3-5 giây.
      </p>
      <div className="mt-6 space-y-2">
        {["CPU", "RAM", "Mainboard", "Ổ đĩa", "GPU", "Mạng"].map((label) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm"
          >
            <div className="h-2 w-2 animate-pulse rounded-full bg-brand" />
            <span className="text-ink-muted">{label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Step4({ onFinish }: { onFinish: () => void }) {
  return (
    <Card className="text-center" glow>
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/20">
        <ShieldCheck className="h-8 w-8 text-success" />
      </div>
      <h2 className="text-2xl font-semibold text-ink">Sẵn sàng!</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        Mọi thứ đã sẵn sàng. Nhấn "Bắt đầu" để vào bảng điều khiển.
      </p>
    </Card>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-3 text-left">
      <Icon className="mb-1 h-4 w-4 text-brand-200" />
      <div className="text-sm font-medium text-ink">{title}</div>
      <div className="text-xs text-ink-muted">{desc}</div>
    </div>
  );
}
