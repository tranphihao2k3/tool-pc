// Toast / notification system — hiển thị thông báo tạm thời ở góc trên-phải.
// Tích hợp với a11y: role="status" cho info/success, role="alert" cho error.
//
// Usage:
//   import { toast } from "@/shared/components/Toast";
//   toast.success("Đã lưu");
//   toast.error("Lỗi: " + err.message);
//   toast.info("Đang tải…");

import { create } from "zustand";
import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number; // ms; 0 = sticky
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** API public — dùng trong code feature. */
export const toast = {
  success: (message: string, duration = 3000) =>
    useToastStore.getState().push({ kind: "success", message, duration }),
  error: (message: string, duration = 5000) =>
    useToastStore.getState().push({ kind: "error", message, duration }),
  info: (message: string, duration = 3000) =>
    useToastStore.getState().push({ kind: "info", message, duration }),
  warning: (message: string, duration = 4000) =>
    useToastStore.getState().push({ kind: "warning", message, duration }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
};

const KIND_STYLES: Record<
  ToastKind,
  { border: string; bg: string; text: string; Icon: typeof Info; role: "status" | "alert" }
> = {
  success: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-200",
    Icon: CheckCircle2,
    role: "status",
  },
  error: {
    border: "border-rose-500/30",
    bg: "bg-rose-500/10",
    text: "text-rose-200",
    Icon: AlertCircle,
    role: "alert",
  },
  warning: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-200",
    Icon: AlertCircle,
    role: "alert",
  },
  info: {
    border: "border-sky-500/30",
    bg: "bg-sky-500/10",
    text: "text-sky-200",
    Icon: Info,
    role: "status",
  },
};

function ToastItem({ toast: t }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const style = KIND_STYLES[t.kind];
  const { Icon } = style;

  useEffect(() => {
    if (t.duration > 0) {
      const timer = window.setTimeout(() => dismiss(t.id), t.duration);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [t.id, t.duration, dismiss]);

  return (
    <div
      role={style.role}
      aria-live={style.role === "alert" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-md border px-3 py-2 shadow-lg backdrop-blur",
        style.border,
        style.bg
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.text)} aria-hidden="true" />
      <div className="flex-1 text-sm text-ink">{t.message}</div>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Đóng thông báo"
        className="shrink-0 rounded p-0.5 text-ink-muted hover:bg-white/10 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Container — đặt 1 lần trong AppShell. */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      aria-label="Thông báo"
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
