import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  glow?: boolean;
}

export function Card({
  title,
  subtitle,
  action,
  glow = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div className={cn(glow ? "card-glow" : "card", "p-5", className)} {...props}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-ink">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
