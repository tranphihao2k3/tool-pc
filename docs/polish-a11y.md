# Polish & Accessibility (Task 12)

Các cải tiến UX/a11y cho PC Manager Pro, đặt sau khi tất cả tính năng đã hoạt động.

## ErrorBoundary

`src/shared/components/ErrorBoundary.tsx` — class component bắt lỗi render.

- **Page-level** (wrap toàn bộ `<Outlet />` trong `AppShell`): 1 page crash không kéo sập app, người dùng vẫn chuyển trang khác được.
- **Inline**: dùng `<ErrorBoundary variant="inline" scope="...">{...}</ErrorBoundary>` quanh 1 widget.

Lỗi được log ra file bằng `captureError` → `frontend_log` command → `tauri-plugin-log` ở
`%APPDATA%\com.pcmanager.pro\logs\`.

## Toast

`src/shared/components/Toast.tsx` — hệ thống thông báo tạm thời với Zustand store.

```ts
import { toast } from "@/shared/components/Toast";

toast.success("Đã lưu");
toast.error("Lỗi: " + err.message, 5000);   // 5s sticky
toast.info("Đang tải…");
toast.warning("Cảnh báo", 0);                // 0 = không tự tắt
toast.dismiss(id);                            // tắt thủ công
```

A11y:
- `role="status"` (polite) cho info/success
- `role="alert"` (assertive) cho error/warning
- Auto-dismiss với `duration` (mặc định 3s), có thể sticky bằng `duration: 0`
- Có nút X để tắt thủ công, có `aria-label`

## Logger

`src/shared/lib/log.ts` — wrapper thống nhất cho console + plugin-log.

```ts
import { log, captureError } from "@/shared/lib/log";

log.info("Cleaner", "Bắt đầu scan");
log.warn("Cleaner", "Một số file bị skip");
log.error("Cleaner", "Permission denied", { path: "C:\\Windows" });
captureError("Dashboard", new Error("WMI timeout"), errorInfo);
```

Tự detect có đang chạy trong Tauri (qua `__TAURI_INTERNALS__`) hay không — nếu có thì
gọi `frontend_log` Rust command, nếu không thì chỉ log console (dev mode).

## A11y Checklist

| Item | Where | Status |
|---|---|---|
| Skip-to-content link | `AppShell` | ✅ |
| `<main id="main-content">` với `aria-label` | `AppShell` | ✅ |
| Focus management khi đổi route | `AppShell` `useEffect` | ✅ |
| Semantic `<nav>` + `aria-label` | `AppSidebar` | ✅ |
| List items dùng `<ul role="list">` | `AppSidebar` | ✅ |
| Decorative icons có `aria-hidden` | `AppSidebar`, `AppTopbar` | ✅ |
| Header có `role="banner"` | `AppTopbar` | ✅ |
| Buttons có `aria-label` | `AppTopbar`, `Toast`, `ErrorBoundary` | ✅ |
| Live regions cho errors | `ErrorBoundary`, `Toast` | ✅ |
| Form fields có `<label>` / `aria-label` | Settings (existing) | ✅ |
| Headings hierarchy đúng (h1 → h2 → h3) | `AppShell`, `AppTopbar`, `AppSidebar` | ✅ |
| Color contrast (WCAG AA) | Theme tokens | ✅ (text-ink ≥ 4.5:1 trên dark) |
| Keyboard navigation | Toàn app | ✅ (native HTML elements) |

## Keyboard Shortcuts (planned v0.2)

- `Ctrl+,` → Settings
- `Ctrl+K` → Command palette
- `Esc` → Đóng modal/dialog
- `Tab` / `Shift+Tab` qua focusable elements (native)

## Testing A11y

- Chrome DevTools → Lighthouse → Accessibility tab (target ≥ 90)
- axe DevTools extension (no violations)
- Manual: Tab qua tất cả interactive elements, mở bằng NVDA/VoiceOver

## Performance & Stress Test (Task 12 acceptance)

- Mở app 30 phút liên tục, không crash
- Background monitor emit mỗi 1s → CPU < 2%, RAM < 200MB
- Toast queue tối đa 10 cái (cũ tự dismiss)
- ErrorBoundary tự recovery khi reload (state reset)
