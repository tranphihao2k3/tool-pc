import { useEffect, useMemo, useState } from "react";
import { Card } from "@/shared/components/Card";
import { ErrorState } from "@/shared/components/ErrorState";
import { Field, Select, ActionBar } from "./components";
import { applyConfig, useConfigCommand } from "./useConfigCommand";
import type { PowerPatch, PowerSettings } from "@/shared/types/system";

/** Lựa chọn thời gian (tính bằng phút) — 0 = Không bao giờ. */
const TIMEOUT_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "Không bao giờ" },
  { value: "1", label: "1 phút" },
  { value: "2", label: "2 phút" },
  { value: "3", label: "3 phút" },
  { value: "5", label: "5 phút" },
  { value: "10", label: "10 phút" },
  { value: "15", label: "15 phút" },
  { value: "20", label: "20 phút" },
  { value: "30", label: "30 phút" },
  { value: "45", label: "45 phút" },
  { value: "60", label: "1 giờ" },
  { value: "120", label: "2 giờ" },
  { value: "180", label: "3 giờ" },
  { value: "240", label: "4 giờ" },
  { value: "360", label: "6 giờ" },
  { value: "480", label: "8 giờ" },
];

interface PowerDraft {
  plan: string;
  monitorTimeoutAc: number;
  monitorTimeoutDc: number;
  sleepTimeoutAc: number;
  sleepTimeoutDc: number;
  hibernateTimeoutAc: number;
  hibernateTimeoutDc: number;
}

function draftFrom(s: PowerSettings): PowerDraft {
  return {
    plan: s.activePlan,
    monitorTimeoutAc: s.monitorTimeoutAc,
    monitorTimeoutDc: s.monitorTimeoutDc,
    sleepTimeoutAc: s.sleepTimeoutAc,
    sleepTimeoutDc: s.sleepTimeoutDc,
    hibernateTimeoutAc: s.hibernateTimeoutAc,
    hibernateTimeoutDc: s.hibernateTimeoutDc,
  };
}

/** Giây → phút (làm tròn). */
const toMinutes = (seconds: number) => Math.round(seconds / 60);

export default function PowerTab() {
  const { data, error, loading, refetch } = useConfigCommand<PowerSettings>(
    "get_power_settings"
  );
  const [draft, setDraft] = useState<PowerDraft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setDraft(draftFrom(data));
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(draftFrom(data));
  }, [data, draft]);

  const set = <K extends keyof PowerDraft>(key: K, value: PowerDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const handleApply = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const patch: PowerPatch = {
        plan: draft.plan,
        monitorTimeoutAc: draft.monitorTimeoutAc,
        monitorTimeoutDc: draft.monitorTimeoutDc,
        sleepTimeoutAc: draft.sleepTimeoutAc,
        sleepTimeoutDc: draft.sleepTimeoutDc,
        hibernateTimeoutAc: draft.hibernateTimeoutAc,
        hibernateTimeoutDc: draft.hibernateTimeoutDc,
      };
      const result = await applyConfig("apply_power_settings", patch);
      if (result) await refetch();
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return (
      <ErrorState
        error={error}
        onRetry={refetch}
        title="Không tải được nhóm Pin & Nguồn"
      />
    );
  }

  if (!data || !draft) {
    return (
      <Card>
        <div className="py-8 text-center text-sm text-ink-muted">
          {loading ? "Đang tải…" : "Chưa có dữ liệu"}
        </div>
      </Card>
    );
  }

  const planOptions: { value: string; label: string }[] = data.availablePlans.map(
    (p) => ({
      value: p.key,
      label: p.name || p.key,
    })
  );

  // Bảo đảm luôn có lựa chọn cho plan hiện tại (kể cả "unknown").
  if (!planOptions.some((o) => o.value === draft.plan)) {
    planOptions.unshift({ value: draft.plan, label: draft.plan });
  }

  const battery = data.battery;

  return (
    <div className="space-y-6">
      <Card
        title="Pin & Nguồn"
        subtitle="Thời gian ngủ, tắt màn hình và gói nguồn điện"
      >
        <Field
          label="Gói nguồn"
          hint="Hiệu năng cao ưu tiên tốc độ, có thể tăng mức tiêu thụ điện."
          htmlFor="id-power-plan"
        >
          <Select
            id="id-power-plan"
            value={draft.plan}
            onChange={(v) => set("plan", v)}
            options={planOptions}
            disabled={busy}
          />
        </Field>

        <Field
          label="Thời gian ngủ"
          hint="Sau thời gian không hoạt động, máy chuyển sang chế độ ngủ."
          htmlFor="id-sleep-ac"
        >
          <div className="flex flex-col gap-2">
            <Select
              id="id-sleep-ac"
              value={String(toMinutes(draft.sleepTimeoutAc))}
              onChange={(v) => set("sleepTimeoutAc", Number(v) * 60)}
              options={TIMEOUT_OPTIONS}
              disabled={busy}
            />
            <Select
              value={String(toMinutes(draft.sleepTimeoutDc))}
              onChange={(v) => set("sleepTimeoutDc", Number(v) * 60)}
              options={TIMEOUT_OPTIONS}
              disabled={busy}
            />
            <div className="flex gap-3 text-[11px] text-ink-subtle">
              <span>Trên cột: cắm sạc</span>
              <span>Dưới: dùng pin</span>
            </div>
          </div>
        </Field>

        <Field
          label="Tắt màn hình sau"
          hint="Màn hình tắt sau khoảng thời gian không hoạt động."
          htmlFor="id-monitor-ac"
        >
          <div className="flex flex-col gap-2">
            <Select
              id="id-monitor-ac"
              value={String(toMinutes(draft.monitorTimeoutAc))}
              onChange={(v) => set("monitorTimeoutAc", Number(v) * 60)}
              options={TIMEOUT_OPTIONS}
              disabled={busy}
            />
            <Select
              value={String(toMinutes(draft.monitorTimeoutDc))}
              onChange={(v) => set("monitorTimeoutDc", Number(v) * 60)}
              options={TIMEOUT_OPTIONS}
              disabled={busy}
            />
            <div className="flex gap-3 text-[11px] text-ink-subtle">
              <span>Trên cột: cắm sạc</span>
              <span>Dưới: dùng pin</span>
            </div>
          </div>
        </Field>

        <Field
          label="Tắt hẳn máy sau"
          hint="Thời gian chờ trước khi máy tắt hẳn (hibernate)."
          htmlFor="id-hibernate-ac"
        >
          <div className="flex flex-col gap-2">
            <Select
              id="id-hibernate-ac"
              value={String(toMinutes(draft.hibernateTimeoutAc))}
              onChange={(v) => set("hibernateTimeoutAc", Number(v) * 60)}
              options={TIMEOUT_OPTIONS}
              disabled={busy}
            />
            <Select
              value={String(toMinutes(draft.hibernateTimeoutDc))}
              onChange={(v) => set("hibernateTimeoutDc", Number(v) * 60)}
              options={TIMEOUT_OPTIONS}
              disabled={busy}
            />
            <div className="flex gap-3 text-[11px] text-ink-subtle">
              <span>Trên cột: cắm sạc</span>
              <span>Dưới: dùng pin</span>
            </div>
          </div>
        </Field>

        <ActionBar
          onReload={refetch}
          onApply={handleApply}
          dirty={dirty}
          busy={busy}
          loading={loading}
        />
      </Card>

      <Card title="Trạng thái pin" subtitle="Thông tin pin hiện tại của máy">
        {battery.hasBattery ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
              <dt className="text-ink-muted">Tên pin</dt>
              <dd className="text-right font-medium text-ink">
                {battery.name || "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
              <dt className="text-ink-muted">Trạng thái</dt>
              <dd className="text-right font-medium text-ink">
                {battery.status}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
              <dt className="text-ink-muted">Mức pin</dt>
              <dd className="text-right font-medium text-ink">
                {battery.chargePercent != null
                  ? `${battery.chargePercent}%`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
              <dt className="text-ink-muted">Thời gian còn lại</dt>
              <dd className="text-right font-medium text-ink">
                {battery.estimatedMinutesRemaining != null
                  ? `${battery.estimatedMinutesRemaining} phút`
                  : "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <div className="text-sm font-medium text-ink">
              Không tìm thấy pin
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Máy tính để bàn không có pin, hoặc laptop chưa nhận diện được
              pin. Thông báo này không đủ để kết luận pin đã hỏng.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
