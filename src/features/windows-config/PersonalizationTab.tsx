import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Card } from "@/shared/components/Card";
import { Button } from "@/shared/components/Button";
import { Segmented } from "@/shared/components/Segmented";
import { Switch } from "@/shared/components/Switch";
import { ErrorState } from "@/shared/components/ErrorState";
import { Field, Select, ActionBar } from "./components";
import { applyConfig, useConfigCommand } from "./useConfigCommand";
import type {
  DesktopIcons,
  PersonalizationPatch,
  PersonalizationSettings,
} from "@/shared/types/system";

interface PersonalizationDraft {
  theme: "light" | "dark" | "custom";
  wallpaperPath: string;
  wallpaperStyle: number;
  lockScreenImage: string;
  desktopIcons: DesktopIcons;
  accentColorId: string;
  accentOnStartTaskbar: number;
  accentOnTitleBars: boolean;
}

function draftFrom(s: PersonalizationSettings): PersonalizationDraft {
  return {
    theme: s.theme,
    wallpaperPath: s.wallpaperPath,
    wallpaperStyle: s.wallpaperStyle,
    lockScreenImage: s.lockScreenImage,
    desktopIcons: { ...s.desktopIcons },
    accentColorId: s.accentColorId,
    accentOnStartTaskbar: s.accentOnStartTaskbar,
    accentOnTitleBars: s.accentOnTitleBars,
  };
}

/** Ảnh dùng cho hình nền / màn hình khóa. */
const IMAGE_FILTERS = [
  { name: "Ảnh", extensions: ["jpg", "jpeg", "png", "bmp"] },
];

export default function PersonalizationTab() {
  const { data, error, loading, refetch } =
    useConfigCommand<PersonalizationSettings>("get_personalization_settings");
  const [draft, setDraft] = useState<PersonalizationDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsSignout, setNeedsSignout] = useState(false);

  useEffect(() => {
    if (data) setDraft(draftFrom(data));
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(draftFrom(data));
  }, [data, draft]);

  const set = <K extends keyof PersonalizationDraft>(
    key: K,
    value: PersonalizationDraft[K]
  ) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const setIcon = (key: keyof DesktopIcons, value: boolean) =>
    setDraft((d) =>
      d ? { ...d, desktopIcons: { ...d.desktopIcons, [key]: value } } : d
    );

  const pickImage = async (
    field: "wallpaperPath" | "lockScreenImage"
  ) => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: IMAGE_FILTERS,
      });
      if (typeof selected === "string") set(field, selected);
    } catch (e: unknown) {
      console.error("Không mở được hộp thoại chọn ảnh", e);
    }
  };

  const handleApply = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const patch: PersonalizationPatch = {
        theme: draft.theme,
        wallpaperPath: draft.wallpaperPath,
        wallpaperStyle: draft.wallpaperStyle,
        lockScreenImage: draft.lockScreenImage,
        desktopIcons: draft.desktopIcons,
        accentColorId: draft.accentColorId,
        accentOnStartTaskbar: draft.accentOnStartTaskbar,
        accentOnTitleBars: draft.accentOnTitleBars,
      };
      const result = await applyConfig("apply_personalization_settings", patch);
      if (result) {
        setNeedsSignout(result.requiresSignout);
        await refetch();
      }
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return (
      <ErrorState
        error={error}
        onRetry={refetch}
        title="Không tải được nhóm Cá nhân hóa"
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

  return (
    <div className="space-y-6">
      <Card
        title="Cá nhân hóa"
        subtitle="Giao diện, hình nền, biểu tượng và màu nhấn của Windows"
      >
        <Field label="Chủ đề" hint="Chuyển giữa giao diện sáng và tối.">
          <div className="flex justify-end">
            <Segmented
              value={draft.theme}
              onChange={(v) => set("theme", v)}
              options={[
                { value: "light", label: "Sáng" },
                { value: "dark", label: "Tối" },
              ]}
              disabled={busy}
            />
          </div>
        </Field>

        <Field
          label="Hình nền"
          hint="Định dạng JPG, PNG hoặc BMP."
          htmlFor="id-wallpaper"
        >
          <div className="flex items-center gap-2">
            <TextPath
              id="id-wallpaper"
              value={draft.wallpaperPath}
              onBrowse={() => pickImage("wallpaperPath")}
              disabled={busy}
            />
          </div>
        </Field>

        <Field label="Cách hiển thị hình nền" htmlFor="id-wallpaper-style">
          <Select
            id="id-wallpaper-style"
            value={String(draft.wallpaperStyle)}
            onChange={(v) => set("wallpaperStyle", Number(v))}
            options={[
              { value: "10", label: "Lấp đầy" },
              { value: "6", label: "Vừa khung" },
              { value: "22", label: "Trải rộng" },
              { value: "2", label: "Kéo giãn" },
            ]}
            disabled={busy}
          />
        </Field>

        <Field
          label="Ảnh màn hình khóa"
          hint="Ảnh hiển thị khi khóa máy."
          htmlFor="id-lockscreen"
        >
          <TextPath
            id="id-lockscreen"
            value={draft.lockScreenImage}
            onBrowse={() => pickImage("lockScreenImage")}
            disabled={busy}
          />
        </Field>

        <Field
          label="Màu nhấn"
          hint="Thay đổi màu nút, liên kết và vùng chọn."
        >
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {data.accentPalette.map((c) => (
              <button
                key={c.id}
                type="button"
                title={`${c.name} (${c.hex})`}
                aria-label={`Màu nhấn ${c.name}`}
                aria-pressed={draft.accentColorId === c.id}
                disabled={busy}
                onClick={() => set("accentColorId", c.id)}
                style={{ backgroundColor: c.hex }}
                className={`h-6 w-6 rounded-full border-2 transition disabled:opacity-50 ${
                  draft.accentColorId === c.id
                    ? "border-white shadow-glow"
                    : "border-transparent hover:border-white/40"
                }`}
              />
            ))}
          </div>
        </Field>

        <Field
          label="Màu nhấn trên Start và thanh tác vụ"
          hint="Bật để thanh tác vụ và menu Start dùng màu nhấn."
        >
          <div className="flex justify-end">
            <Segmented
              value={String(draft.accentOnStartTaskbar)}
              onChange={(v) => set("accentOnStartTaskbar", Number(v))}
              options={[
                { value: "0", label: "Tắt" },
                { value: "1", label: "Bật" },
                { value: "2", label: "Chỉ taskbar" },
              ]}
              disabled={busy}
            />
          </div>
        </Field>

        <Field
          label="Màu nhấn trên thanh tiêu đề"
          hint="Áp dụng màu nhấn lên thanh tiêu đề và viền cửa sổ."
        >
          <div className="flex justify-end">
            <Switch
              checked={draft.accentOnTitleBars}
              onChange={(v) => set("accentOnTitleBars", v)}
              disabled={busy}
              label="Màu nhấn trên thanh tiêu đề"
            />
          </div>
        </Field>

        <Field
          label="Biểu tượng Desktop"
          hint="Bật hoặc tắt từng biểu tượng hệ thống."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ["thisPc", "This PC"],
                ["network", "Mạng"],
                ["recycleBin", "Thùng rác"],
                ["userFiles", "Thư mục người dùng"],
                ["controlPanel", "Control Panel"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-2 rounded-md border border-white/5 px-2.5 py-1.5 text-xs text-ink"
              >
                <span className="truncate">{label}</span>
                <Switch
                  checked={draft.desktopIcons[key]}
                  onChange={(v) => setIcon(key, v)}
                  disabled={busy}
                  label={label}
                />
              </label>
            ))}
          </div>
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

/** Ô hiển thị đường dẫn ảnh + nút "Chọn ảnh". */
function TextPath({
  id,
  value,
  onBrowse,
  disabled,
}: {
  id: string;
  value: string;
  onBrowse: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="text"
        readOnly
        value={value}
        title={value}
        className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-bg-100 px-3 py-2 text-xs text-ink-muted"
      />
      <Button variant="secondary" onClick={onBrowse} disabled={disabled}>
        Chọn ảnh
      </Button>
    </div>
  );
}
