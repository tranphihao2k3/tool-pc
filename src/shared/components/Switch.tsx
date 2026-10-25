import { cn } from "@/shared/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

/**
 * Toggle switch dùng cho Settings. Accessible (aria-checked + role=switch).
 * Tránh phụ thuộc shadcn (chưa được scaffold) — viết tay cho gọn.
 */
export function Switch({ checked, onChange, disabled, label, id }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        "border border-white/10 transition-colors duration-150",
        "focus:outline-none focus:ring-2 focus:ring-brand/40",
        checked ? "bg-brand" : "bg-white/10",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow",
          "transition-transform duration-150",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}
