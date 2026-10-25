import { useEffect, useMemo, useState } from "react";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { Segmented } from "@/shared/components/Segmented";
import { ErrorState } from "@/shared/components/ErrorState";
import { Field, Select, TextInput, ActionBar } from "./components";
import { applyConfig, useConfigCommand } from "./useConfigCommand";
import type { IdentityPatch, IdentitySettings } from "@/shared/types/system";

/** Bản chỉnh sửa cục bộ — chỉ gửi field đã đổi lên backend. */
interface IdentityDraft {
  computerName: string;
  organization: string;
  timeZoneTzId: string;
  /** Locale của vùng được chọn (vd "en-VN") → ghi vào `LocaleName`. */
  regionLocale: string;
  shortDate: string;
  shortTime: string;
  timeFormat24h: boolean;
  decimal: string;
  thousandSep: string;
  keyboardLayoutId: number;
}

function draftFrom(s: IdentitySettings): IdentityDraft {
  return {
    computerName: s.computerName,
    organization: s.organization,
    timeZoneTzId: s.timeZoneTzId,
    regionLocale: s.locale.locale,
    shortDate: s.locale.shortDate,
    shortTime: s.locale.shortTime,
    timeFormat24h: s.locale.timeFormat24h,
    decimal: s.locale.decimal,
    thousandSep: s.locale.thousandSep,
    keyboardLayoutId: s.keyboardLayoutId,
  };
}

export default function IdentityTab() {
  const { data, error, loading, refetch } = useConfigCommand<IdentitySettings>(
    "get_identity_settings"
  );
  const [draft, setDraft] = useState<IdentityDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsSignout, setNeedsSignout] = useState(false);

  // Nạp lại draft mỗi khi backend trả dữ liệu mới (lần đầu + sau Tải lại).
  useEffect(() => {
    if (data) setDraft(draftFrom(data));
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(draftFrom(data));
  }, [data, draft]);

  // Validate tên máy ngay để user thấy lỗi trước khi bấm Áp dụng.
  const nameError = useMemo(() => {
    if (!draft) return undefined;
    const name = draft.computerName.trim();
    if (name.length === 0) return undefined;
    if (name.length > 15) return "Tối đa 15 ký tự";
    if (/\s/.test(name)) return "Không được chứa khoảng trắng";
    if (/["\\/:*?<>|]/.test(name)) return 'Không được chứa: " \\ / : * ? < > |';
    return undefined;
  }, [draft]);

  const set = <K extends keyof IdentityDraft>(key: K, value: IdentityDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const handleApply = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const patch: IdentityPatch = {
        computerName: draft.computerName.trim(),
        organization: draft.organization,
        timeZoneTzId: draft.timeZoneTzId,
        keyboardLayoutId: draft.keyboardLayoutId,
        locale: {
          locale: draft.regionLocale,
          shortDate: draft.shortDate,
          shortTime: draft.shortTime,
          timeFormat24h: draft.timeFormat24h,
          decimal: draft.decimal,
          thousandSep: draft.thousandSep,
        },
      };
      const result = await applyConfig("apply_identity_settings", patch);
      if (result) {
        setNeedsSignout(result.requiresSignout);
        await refetch();
      }
    } finally {
      setBusy(false);
    }
  };

  /** Áp dụng nhanh bộ cấu hình cho người dùng Việt Nam. */
  const applyVietnamesePreset = () => {
    if (!draft || !data) return;
    // Bố cục bàn phím Việt Nam = 0x0422 = 1066 (tên "Vietnamese").
    const vnKeyboard =
      data.keyboardLayouts.find((k) => k.id === 1066) ??
      data.keyboardLayouts.find((k) =>
        k.name.toLowerCase().includes("vietnam")
      );
    const tz = data.timeZones.find(
      (t) => t.tzId === "SE Asia Standard Time"
    );
    setDraft({
      ...draft,
      timeZoneTzId: tz?.tzId ?? draft.timeZoneTzId,
      shortDate: "dd/MM/yyyy",
      shortTime: "HH:mm",
      timeFormat24h: true,
      decimal: ",",
      thousandSep: ".",
      keyboardLayoutId: vnKeyboard?.id ?? draft.keyboardLayoutId,
    });
  };

  if (error && !data) {
    return <ErrorState error={error} onRetry={refetch} title="Không tải được nhóm Định danh" />;
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

  const timeZoneOptions = data.timeZones.map((tz) => ({
    value: tz.tzId,
    label: tz.display || tz.tzId,
  }));

  const countryOptions = data.countries.map((c) => ({
    value: c.locale,
    label: c.name,
  }));

  const keyboardOptions = data.keyboardLayouts.map((k) => ({
    value: String(k.id),
    label: k.name,
  }));

  return (
    <div className="space-y-6">
      <Card
        title="Định danh"
        subtitle="Tên máy, tổ chức, vùng và định dạng ngày giờ"
        action={
          <Button variant="secondary" onClick={applyVietnamesePreset} disabled={busy}>
            Thiết lập Việt Nam
          </Button>
        }
      >
        <Field
          label="Tên máy tính"
          hint="Tối đa 15 ký tự, không được chứa khoảng trắng. Cần đăng nhập lại để có hiệu lực."
          htmlFor="id-computer-name"
          error={nameError}
        >
          <TextInput
            id="id-computer-name"
            value={draft.computerName}
            onChange={(v) => set("computerName", v)}
            invalid={Boolean(nameError)}
            maxLength={15}
            disabled={busy}
          />
        </Field>

        <Field
          label="Tên người dùng"
          hint="Thông tin tài khoản hiện tại — đổi trong Cài đặt Windows."
          htmlFor="id-user-name"
        >
          <TextInput
            id="id-user-name"
            value={data.userName}
            onChange={() => {}}
            disabled
          />
        </Field>

        <Field
          label="Tổ chức"
          hint="Hiển thị trong thông tin hệ thống. Cần quyền Administrator."
          htmlFor="id-organization"
        >
          <TextInput
            id="id-organization"
            value={draft.organization}
            onChange={(v) => set("organization", v)}
            disabled={busy}
          />
        </Field>

        <Field
          label="Múi giờ"
          hint="Đồng bộ thời gian địa phương."
          htmlFor="id-timezone"
        >
          <Select
            id="id-timezone"
            value={draft.timeZoneTzId}
            onChange={(v) => set("timeZoneTzId", v)}
            options={timeZoneOptions}
            disabled={busy}
          />
        </Field>

        <Field
          label="Vùng"
          hint="Quốc gia hoặc khu vực — ảnh hưởng nội dung và dịch vụ theo vùng."
          htmlFor="id-region"
        >
          <Select
            id="id-region"
            value={draft.regionLocale}
            onChange={(v) => set("regionLocale", v)}
            options={countryOptions}
            disabled={busy}
          />
        </Field>

        <Field
          label="Kiểu ngày"
          hint="Định dạng hiển thị ngày tháng."
          htmlFor="id-date-format"
        >
          <Select
            id="id-date-format"
            value={draft.shortDate}
            onChange={(v) => set("shortDate", v)}
            options={data.dateFormats}
            disabled={busy}
          />
        </Field>

        <Field label="Kiểu giờ" hint="12 giờ (AM/PM) hoặc 24 giờ.">
          <div className="flex justify-end">
            <Segmented
              value={draft.timeFormat24h ? "24h" : "12h"}
              onChange={(v) => set("timeFormat24h", v === "24h")}
              options={[
                { value: "12h", label: "12 giờ" },
                { value: "24h", label: "24 giờ" },
              ]}
              disabled={busy}
            />
          </div>
        </Field>

        <Field
          label="Kiểu giờ (định dạng)"
          hint="Mẫu hiển thị giờ cụ thể."
          htmlFor="id-time-format"
        >
          <Select
            id="id-time-format"
            value={draft.shortTime}
            onChange={(v) => set("shortTime", v)}
            options={data.timeFormats}
            disabled={busy}
          />
        </Field>

        <Field
          label="Dấu thập phân"
          hint="Ký tự phân tách phần thập phân."
          htmlFor="id-decimal"
        >
          <Select
            id="id-decimal"
            value={draft.decimal}
            onChange={(v) => set("decimal", v)}
            options={data.decimalFormats}
            disabled={busy}
          />
        </Field>

        <Field
          label="Dấu phân cách hàng nghìn"
          hint="Ký tự phân tách nhóm hàng nghìn."
          htmlFor="id-thousand"
        >
          <Select
            id="id-thousand"
            value={draft.thousandSep}
            onChange={(v) => set("thousandSep", v)}
            options={data.thousandFormats}
            disabled={busy}
          />
        </Field>

        <Field
          label="Bàn phím"
          hint="Bố cục bàn phím đang dùng."
          htmlFor="id-keyboard"
        >
          <Select
            id="id-keyboard"
            value={String(draft.keyboardLayoutId)}
            onChange={(v) => set("keyboardLayoutId", Number(v))}
            options={keyboardOptions}
            disabled={busy}
          />
        </Field>

        <ActionBar
          onReload={refetch}
          onApply={handleApply}
          dirty={dirty}
          busy={busy}
          loading={loading}
          needsSignout={needsSignout}
        />
      </Card>
    </div>
  );
}
