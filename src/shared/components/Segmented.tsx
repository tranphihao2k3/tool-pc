import { cn } from "@/shared/lib/utils";

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string; desc?: string }[];
  onChange: (next: T) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Nhóm nút radio inline — dùng cho Theme/Language/Refresh interval...
 * Không dùng <select> vì select khó style nhất quán trên Windows.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex rounded-lg border border-white/10 bg-bg-100 p-1",
        disabled && "opacity-50",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            title={opt.desc}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              active
                ? "bg-brand text-white shadow-glow"
                : "text-ink-muted hover:bg-white/5 hover:text-ink"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
