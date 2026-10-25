import { cn } from "@/shared/lib/utils";

export function ProgressBar({
  value,
  max = 100,
  className,
  tone = "brand",
}: {
  value: number;
  max?: number;
  className?: string;
  tone?: "brand" | "accent" | "success" | "warning" | "danger";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill =
    tone === "accent"
      ? "bg-accent"
      : tone === "success"
      ? "bg-success"
      : tone === "warning"
      ? "bg-warning"
      : tone === "danger"
      ? "bg-danger"
      : "bg-brand-gradient";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-white/5", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
