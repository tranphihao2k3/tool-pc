import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface StatRow {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

export function StatList({ rows, columns = 2 }: { rows: StatRow[]; columns?: 1 | 2 | 3 }) {
  const colClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
      ? "grid-cols-1 md:grid-cols-2"
      : "grid-cols-1 md:grid-cols-3";
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm", colClass)}>
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2 last:border-0">
          <dt className="text-ink-muted">{r.label}</dt>
          <dd className="text-right font-medium text-ink">
            {r.value}
            {r.hint && <span className="ml-1 text-xs text-ink-subtle">{r.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
