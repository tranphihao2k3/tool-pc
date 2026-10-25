import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/Button";
import { RefreshCw, Save, RotateCcw } from "lucide-react";

/**
 * Primitives dùng chung cho trang Thiết lập.
 *
 * Mọi control đều có `id` gắn với `label` bằng `htmlFor` để screen reader
 * đọc đúng, và `aria-invalid` khi có lỗi.
 */

const CONTROL_CLASS =
  "w-full rounded-lg border border-white/10 bg-bg-100 px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-subtle focus:border-brand focus:outline-none " +
  "focus:ring-2 focus:ring-brand/40 disabled:opacity-50";

interface FieldProps {
  label: string;
  hint?: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

/** Một hàng cấu hình: nhãn + mô tả bên trái, control bên phải. */
export function Field({
  label,
  hint,
  htmlFor,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-white/5 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="min-w-0 sm:max-w-[52%]">
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-ink"
        >
          {label}
        </label>
        {hint && (
          <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>
        )}
        {error && (
          <p className="mt-0.5 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="w-full shrink-0 sm:w-auto sm:min-w-[220px] sm:text-right">
        {children}
      </div>
    </div>
  );
}

interface SelectProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  invalid?: boolean;
}

/** Dropdown native — style thống nhất với input. */
export function Select({
  id,
  value,
  onChange,
  options,
  disabled,
  invalid,
}: SelectProps) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(CONTROL_CLASS, invalid && "border-danger")}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

interface TextInputProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  maxLength?: number;
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  invalid,
  maxLength,
}: TextInputProps) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(CONTROL_CLASS, invalid && "border-danger")}
    />
  );
}

interface ActionBarProps {
  onReload: () => void;
  onApply: () => void;
  onRestart?: () => void;
  dirty: boolean;
  busy?: boolean;
  loading?: boolean;
  /** true nếu cần đăng xuất lại để thấy thay đổi (đổi tên máy, múi giờ). */
  needsSignout?: boolean;
}

/**
 * Thanh thao tác chung cho các tab: Tải lại / Áp dụng / Khởi động lại.
 *
 * Nút "Áp dụng" bị vô hiệu hóa khi không có thay đổi nào — đúng như
 * Anhdv Boot Toolkit, tránh user bấm nhầm rồi tưởng đã lưu.
 */
export function ActionBar({
  onReload,
  onApply,
  onRestart,
  dirty,
  busy,
  loading,
  needsSignout,
}: ActionBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-4">
      {needsSignout && (
        <span className="mr-auto text-xs text-warning">
          Một số thay đổi cần đăng xuất lại mới có hiệu lực đầy đủ.
        </span>
      )}
      <Button variant="ghost" onClick={onReload} disabled={busy || loading}>
        <RefreshCw className="h-4 w-4" /> Tải lại
      </Button>
      <Button
        variant="primary"
        onClick={onApply}
        loading={busy}
        disabled={!dirty}
        title={dirty ? undefined : "Không có thay đổi nào để áp dụng"}
      >
        <Save className="h-4 w-4" /> Áp dụng
      </Button>
      {onRestart && (
        <Button variant="secondary" onClick={onRestart} disabled={busy}>
          <RotateCcw className="h-4 w-4" /> Khởi động lại
        </Button>
      )}
    </div>
  );
}
