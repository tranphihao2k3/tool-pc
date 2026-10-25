---
name: PC Manager Pro - Full Plan
overview: Clone đầy đủ 30 màn hình UX/UI thành app desktop Tauri+React+TS, local-first, lấy thông tin phần cứng/phần mềm Windows, chia nhỏ thành 12 task triển khai tuần tự có test/debug.
todos:
  - id: task1_setup
    content: "Task 1: Setup project Tauri+React+TS + design system (3-4 ngày)"
    status: completed
  - id: task2_onboarding
    content: "Task 2: Onboarding flow - 4 màn hình Splash/Welcome/Permissions/Complete (2 ngày)"
    status: completed
  - id: task3_system_info
    content: "Task 3: System Info - 5 màn hình + Rust commands lấy HW/SW (5 ngày)"
    status: completed
  - id: task4_dashboard
    content: "Task 4: Dashboard + Real-time Monitor - 4 màn hình + chart (3 ngày)"
    status: completed
  - id: task5_optimize
    content: "Task 5: Optimize - 6 màn hình Cleaner/Booster/Repair/Startup (6 ngày)"
    status: in_progress
  - id: task6_security
    content: "Task 6: Security - 5 màn hình wrap Windows Defender (4 ngày)"
    status: pending
  - id: task7_driver
    content: "Task 7: Driver Manager - 3 màn hình + WMI + pnputil (3 ngày)"
    status: pending
  - id: task8_tools
    content: "Task 8: Tools Hub - 12+ tiện ích mini (3 ngày)"
    status: pending
  - id: task9_settings
    content: "Task 9: Settings + About - 2 màn hình + i18n VI/EN (2 ngày)"
    status: in_progress
  - id: task10_realtime
    content: "Task 10: Realtime event system + global state (1.5 ngày)"
    status: pending
  - id: task11_build
    content: "Task 11: Build + đóng gói .msi/.exe + auto-update (1.5 ngày)"
    status: pending
  - id: task12_polish
    content: "Task 12: Polish - error handling, a11y, log, uninstaller (2 ngày)"
    status: pending
isProject: false
---

# PC Manager Pro — Kế hoạch triển khai đầy đủ

> Stack: **Tauri 2 + React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui** (UI clone từ 30 ảnh) + **Zustand** (state) + **React Router** (routing) + **Recharts** (biểu đồ) + **Lucide** (icons). Lưu data local qua Tauri Store. Lấy thông tin HW/SW Windows bằng **Rust crate `sysinfo` + `wmi` + `windows` crate** (qua Tauri commands).

> **Cập nhật 17/10/2026**: Task 1, 2 đã hoàn thành. Task 3–5, 9 có skeleton UI; backend Rust mới chỉ có `system_info.rs` (chưa rõ nội dung). Tất cả page chưa wire-up với Tauri commands.

---

## 0. Phân tích 30 màn hình UX/UI — đã đọc & phân loại

App nguồn là **công cụ quản lý PC toàn diện** (tiếng Việt, theme tối gradient tím-xanh). Chia thành **8 nhóm chức năng / 30 màn hình**:

| # | Nhóm | Màn hình | Mô tả ngắn |
|---|---|---|---|
| **1. Onboarding** | 1 | SplashScreen | Logo + nút "Bắt đầu" |
| **1. Onboarding** | 2 | WelcomeScreen | Hướng dẫn + 4 bước |
| **1. Onboarding** | 3 | PermissionsScreen | Xin quyền admin/system info |
| **1. Onboarding** | 4 | SetupCompleteScreen | "Hoàn tất" + vào Dashboard |
| **2. Dashboard** | 5 | HomeDashboard | Tổng quan PC: CPU/RAM/Disk + 8 quick actions |
| **2. Dashboard** | 6 | SystemInfoOverview | Thông tin OS/HW tổng quan |
| **2. Dashboard** | 7 | RealTimeMonitor | Live CPU/RAM/Net chart |
| **2. Dashboard** | 8 | QuickActionsGrid | Lưới 8 tác vụ nhanh |
| **3. System Info** | 9 | SystemInfoMain | Menu dọc trái: Tổng quan/Phần cứng/Hiệu năng/Mạng |
| **3. System Info** | 10 | HardwareDetails | CPU, RAM, Mainboard, Disk, GPU chi tiết |
| **3. System Info** | 11 | SoftwareList | Danh sách phần mềm đã cài (table) |
| **3. System Info** | 12 | StartupPrograms | Quản lý startup apps |
| **3. System Info** | 13 | SystemReport | Xuất báo cáo (PDF/HTML) |
| **4. Optimize** | 14 | OptimizeMain | Menu: Dọn rác/Tăng tốc/Sửa lỗi/Startup |
| **4. Optimize** | 15 | CleanerScreen | Quét + xóa: Temp/Recycle/Logs/Cache |
| **4. Optimize** | 16 | CleanerScanning | Đang quét (progress + file list) |
| **4. Optimize** | 17 | BoosterScreen | Tắt service/dịch vụ không cần |
| **4. Optimize** | 18 | RepairScreen | Quét & sửa lỗi Windows (SFC/DISM) |
| **4. Optimize** | 19 | StartupManager | Bật/tắt startup (registry + TaskScheduler) |
| **5. Security** | 20 | SecurityMain | Menu: Scan/Threats/Quarantine/Real-time |
| **5. Security** | 21 | AntivirusScreen | Quét virus (Windows Defender wrapper) |
| **5. Security** | 22 | ThreatListScreen | Danh sách mối đe dọa |
| **5. Security** | 23 | QuarantineScreen | Khu vực cách ly |
| **5. Security** | 24 | RealTimeProtection | Bật/tắt real-time shield |
| **6. Driver** | 25 | DriverManagerMain | Menu: Update/Backup/Restore |
| **6. Driver** | 26 | DriverUpdateList | Danh sách driver cần update |
| **6. Driver** | 27 | DriverBackupScreen | Sao lưu driver |
| **7. Tools** | 28 | ToolsHub | Lưới 12+ tiện ích (Uninstall, Defrag, File Shredder, v.v.) |
| **8. Settings** | 29 | SettingsScreen | Theme/Language/About/Update/Privacy |
| **8. Settings** | 30 | AboutScreen | Version + credits + check update |

---

## 1. Tech stack & kiến trúc

### Frontend (`src/`)
```
src/
├── app/                    # App shell, router, providers
│   ├── App.tsx
│   ├── router.tsx
│   └── providers.tsx
├── features/               # Mỗi feature = 1 module
│   ├── onboarding/         # Task 1
│   ├── dashboard/          # Task 2
│   ├── system-info/        # Task 3
│   ├── optimize/           # Task 4
│   ├── security/           # Task 5
│   ├── driver/             # Task 6
│   ├── tools/              # Task 7
│   └── settings/           # Task 8
├── shared/                 # UI kit, hooks, types
│   ├── ui/                 # shadcn components
│   ├── components/         # AppShell, Sidebar, Topbar
│   ├── hooks/              # useTauriCommand, useSystemInfo
│   ├── lib/                # utils
│   └── types/              # TS types
├── stores/                 # Zustand stores
└── styles/                 # Tailwind config + globals
```

### Backend Rust (`src-tauri/src/`)
```
src-tauri/src/
├── main.rs                 # entrypoint
├── commands/
│   ├── mod.rs
│   ├── system_info.rs      # OS, CPU, RAM, Disk, GPU, Network
│   ├── software.rs         # installed apps
│   ├── startup.rs          # startup apps (registry)
│   ├── cleaner.rs          # temp files scan/delete
│   ├── booster.rs          # services enable/disable
│   ├── repair.rs           # SFC/DISM wrapper
│   ├── security.rs         # Defender scan/threats
│   ├── driver.rs           # driver list/backup
│   ├── tools.rs            # uninstall, defrag, etc.
│   └── settings.rs         # app config
├── domain/                 # structs, enums
├── infra/                  # WMI, registry, file IO
└── state.rs                # AppState
```

### Tech detail
- **Tauri 2** với plugin `tauri-plugin-store` (lưu setting), `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-shell`, `tauri-plugin-os`.
- **Rust crates**: `sysinfo` (CPU/RAM/process), `wmi` (Windows WMI), `windows` (registry, services), `serde`, `tokio`, `walkdir`, `anyhow`.
- **UI**: TailwindCSS 3 + shadcn/ui (clone theme tối gradient tím-xanh) + Recharts + lucide-react + framer-motion (transition mượt).
- **State**: Zustand (mỗi feature 1 store) + React Query cho async data.

---

## 2. Design system (clone từ ảnh)

Trích từ ảnh: **theme tối**, nền gradient tím → xanh dương, card bo góc 16px, shadow nhẹ, accent màu xanh sáng, font sans-serif. Token màu:

```ts
// tailwind.config.ts (rút gọn)
colors: {
  bg: { primary: '#0F0B1E', secondary: '#1A1432' },
  card: '#221A3D',
  border: '#2E2550',
  accent: { primary: '#7C3AED', secondary: '#3B82F6' },
  text: { primary: '#FFFFFF', secondary: '#A8A2C7', muted: '#6B6585' },
  success: '#10B981', warning: '#F59E0B', danger: '#EF4444'
}
```

---

## 3. Chia task triển khai (12 task, làm tuần tự, có test/debug)

Mỗi task có: **mục tiêu → việc cần làm → tiêu chí test → debug checklist**.

### TASK 1 — Khởi tạo project & design system (3-4 ngày) ✅ COMPLETED

**Mục tiêu**: Project chạy được `npm run tauri dev`, theme & UI kit sẵn sàng.

**Đã làm**:
- [x] `npm create tauri-app@latest` (template React+TS)
- [x] Cài TailwindCSS 3 + shadcn/ui CLI + init
- [x] Cấu hình `tailwind.config.ts` theo token màu
- [x] Build `AppShell` (sidebar trái + topbar + content area)
- [x] Build các component dùng chung: `Card`, `Button`, `ProgressBar`, `ErrorState`, `StatList`
- [x] Setup Zustand + React Router + i18n (vi/en)
- [x] Routing skeleton: 19 routes (full lazy-loaded)
- [x] `vite build` ra `dist/` thành công
- [x] Rust target build ra `pc-manager-pro.exe` debug

**Test**: PASS — `npm run build` chạy OK, `dist/` có output, target debug có exe.

---

### TASK 2 — Onboarding flow (4 màn hình: Splash, Welcome, Permissions, SetupComplete) (2 ngày) ✅ COMPLETED

**Mục tiêu**: 4 màn hình UX-1 → UX-4 hoạt động, có state lưu "đã onboard".

**Đã làm**:
- [x] `features/onboarding/OnboardingPage.tsx` gộp 4 step trong 1 page (dùng query `?step=1..4`)
- [x] Step 1: Welcome (Zap + ShieldCheck + Globe)
- [x] Step 2: Permissions list
- [x] Step 3: Scan hardware (UI-only, có progress bar)
- [x] Step 4: Ready (ShieldCheck success)
- [x] Lưu `pcmp.onboarded.v1` trong localStorage
- [x] Auto-redirect: nếu đã onboard → /dashboard

**Test**: PASS — flow 4 bước navigate được, lưu state OK.

**Còn thiếu**:
- [ ] Chuyển từ localStorage sang `tauri-plugin-store`
- [ ] Auto-detect admin elevation thật
- [ ] Animation mượt với framer-motion

---

### TASK 3 — System Info (5 màn hình: Main, Hardware, Software, Startup, Report) (5 ngày) ⚠️ IN PROGRESS

**Mục tiêu**: Lấy được toàn bộ thông tin phần cứng + phần mềm, hiển thị đúng UX-9 → UX-13.

**Đã làm (UI skeleton)**:
- [x] `SystemOverviewPage.tsx`
- [x] `CpuPage.tsx`, `RamPage.tsx`, `MainboardPage.tsx`
- [x] `DiskPage.tsx`, `GpuPage.tsx`, `NetworkPage.tsx`
- [x] `SoftwarePage.tsx`, `StartupPage.tsx`

**Đã làm (backend)**:
- [x] `src-tauri/src/commands/system_info.rs` (file tồn tại, chưa review nội dung)
- [x] `src-tauri/src/commands/mod.rs` export

**Còn làm (backend)**:
- [ ] Command `get_os_info` → `tauri-plugin-os` + `sysinfo`
- [ ] Command `get_cpu_info` → brand, cores, frequency (sysinfo)
- [ ] Command `get_ram_info` → total/used/available
- [ ] Command `get_disk_info` → danh sách ổ đĩa
- [ ] Command `get_gpu_info` → WMI `Win32_VideoController`
- [ ] Command `get_motherboard_info` → WMI `Win32_BaseBoard`
- [ ] Command `get_network_info` → adapter, IP, MAC
- [ ] Command `get_installed_software` → registry
- [ ] Command `get_startup_programs` → registry Run/RunOnce
- [ ] Command `export_system_report` → HTML

**Còn làm (frontend wire-up)**:
- [ ] Mỗi page dùng `invoke()` thay vì mock data
- [ ] Zod schema validate response
- [ ] Loading/Error state

**Debug**:
- WMI timeout → tăng timeout, fallback về sysinfo
- Registry permission denied → chạy app elevated
- Software list thiếu → check cả `HKCU` + `WOW6432Node`

---

### TASK 4 — Dashboard + Real-time Monitor (4 màn hình) (3 ngày) ⚠️ IN PROGRESS

**Mục tiêu**: 4 màn hình UX-5 → UX-8, có chart real-time.

**Đã làm**:
- [x] `DashboardPage.tsx` với 6 stat card (CPU/RAM/Disk/Temp/GPU/Net)
- [x] `Sparkline` SVG component
- [x] `useMockRealtime` hook (setInterval 1s)
- [x] 4 Shortcut button

**Còn làm**:
- [ ] Rust command `get_realtime_stats` → spawn interval poll (1s) emit event
- [ ] Frontend `listen('realtime-stats', ...)`
- [ ] `RealTimeMonitor.tsx` — 3 Recharts line chart (CPU%, RAM MB, Net KB/s)
- [ ] `QuickActionsGrid.tsx` — 8 icon tile dẫn đến feature
- [ ] Cleanup interval/listener khi unmount

**Debug**:
- Chart render chậm → `useTransition` + `requestAnimationFrame`
- Event không nhận → check `app.emit_to` vs `app.emit`

---

### TASK 5 — Optimize (6 màn hình) (6 ngày) ⚠️ IN PROGRESS

**Mục tiêu**: UX-14 → UX-19 — quét, xóa, tăng tốc, sửa lỗi Windows.

**Đã làm (UI skeleton)**:
- [x] `CleanerPage.tsx`, `BoosterPage.tsx`, `RepairPage.tsx`

**Còn làm**:
- [ ] Rust command `scan_temp_files` / `delete_files`
- [ ] Rust command `list_services` / `set_service_state`
- [ ] Rust command `run_sfc_scan` / `run_dism_repair`
- [ ] Rust command `toggle_startup` (registry)
- [ ] UI Cleaner: category list với checkbox + size
- [ ] UI Booster: service list + toggle
- [ ] UI Repair: 2 button + log output stream

**Test**:
- Cleaner quét được 100MB+ temp files
- Confirm dialog trước khi xóa
- Booster đổi service state → kiểm tra `services.msc`

**Debug**:
- Service disable gây crash → check `SafeToDisable` list
- SFC cần admin → kiểm tra elevation

---

### TASK 6 — Security (5 màn hình) (4 ngày) ❌ PENDING

**Mục tiêu**: UX-20 → UX-24 — wrap Windows Defender.

**Việc cần làm**:
- [ ] Command `start_defender_scan` (quick/full/custom) → `Start-MpScan`
- [ ] Command `get_threats` → `Get-MpThreatDetection`
- [ ] Command `quarantine_threat` / `restore_threat` / `remove_threat`
- [ ] Command `get_realtime_protection` / `set_realtime_protection` → `Set-MpPreference`
- [ ] `AntivirusScreen.tsx` — 3 nút scan + progress
- [ ] `ThreatListScreen.tsx` — table threat + action menu
- [ ] `QuarantineScreen.tsx`
- [ ] `RealTimeProtection.tsx` — toggle

**Test**:
- Quick scan chạy ~5 phút, log stream real-time
- Download EICAR test → threat xuất hiện
- Toggle real-time → check Settings Windows Defender

**Debug**:
- PowerShell chậm → cache output, stream qua event
- Defender API change version → fallback WMI `MSFT_MpThreat`

---

### TASK 7 — Driver Manager (3 màn hình) (3 ngày) ❌ PENDING

**Mục tiêu**: UX-25 → UX-27.

**Việc cần làm**:
- [ ] Command `list_drivers` → WMI `Win32_PnPSignedDriver`
- [ ] Command `check_driver_update` → compare version
- [ ] Command `backup_drivers` → `pnputil /export-driver`
- [ ] Command `restore_drivers` → `pnputil /add-driver`
- [ ] `DriverUpdateList.tsx` — table
- [ ] `DriverBackupScreen.tsx` — chọn folder + progress

**Test**: List ~50-150 drivers, backup folder có .inf files, restore thành công.

---

### TASK 8 — Tools Hub (1 màn hình, 12+ tiện ích) (3 ngày) ❌ PENDING

**Mục tiêu**: UX-28 — grid 12+ tiện ích mini.

**Việc cần làm**:
- [ ] `ToolsHub.tsx` — grid 3-4 cột
- [ ] Uninstall App, Disk Cleanup, Defragment, File Shredder, Registry Cleaner, Duplicate Finder, Large File Finder, System Restore Point, Power Plan Switcher, Network Reset, DNS Flush, Battery Report
- [ ] Mỗi tool 1 command Rust

**Test**: Click 12 tile → mỗi cái chạy đúng. File Shredder không recover được.

---

### TASK 9 — Settings + About (2 màn hình) (2 ngày) ⚠️ IN PROGRESS

**Mục tiêu**: UX-29, UX-30.

**Đã làm**:
- [x] `SettingsPage.tsx` (file tồn tại, chưa rõ nội dung)
- [x] i18n setup: `vi.json`, `en.json` + `i18n.ts`

**Còn làm**:
- [ ] Theme Light/Dark/System
- [ ] Auto-start with Windows
- [ ] Minimize to tray
- [ ] Check update on launch
- [ ] Reset to default
- [ ] AboutScreen: version + check update
- [ ] Lưu tất cả vào `tauri-plugin-store`

**Test**:
- Đổi language → text đổi theo
- Auto-start → check Task Manager > Startup

---

### TASK 10 — Real-time monitor event system + global state (1.5 ngày) ❌ PENDING

**Mục tiêu**: Tối ưu performance, tránh polling trùng.

**Việc cần làm**:
- [ ] Singleton `SystemMonitor` trong Rust
- [ ] Broadcast event `stats-update` mỗi 1s
- [ ] Frontend `useSystemStats()` hook subscribe event
- [ ] Cleanup khi app đóng
- [ ] Pause monitor khi tab không visible (Page Visibility API)

**Test**: Mở 3 tab → chỉ 1 background poll. Ẩn tab → CPU giảm.

---

### TASK 11 — Build, đóng gói, auto-update (1.5 ngày) ❌ PENDING

**Mục tiêu**: Build ra .msi / .exe cài được.

**Việc cần làm**:
- [ ] Cấu hình `tauri.conf.json`: identifier, version, icon
- [ ] Generate icon đa kích thước (256, 128, 64, 32, 16)
- [ ] Tauri bundler → `.msi` (WiX) + `.exe` (NSIS)
- [ ] Code signing (nếu có cert)
- [ ] Auto-update qua `tauri-plugin-updater` + GitHub Releases manifest

**Test**: `npm run tauri build` ra installer. Cài thử máy sạch chạy OK.

---

### TASK 12 — Polish, accessibility, error handling (2 ngày) ❌ PENDING

**Mục tiêu**: App hoàn thiện, không crash, accessible.

**Việc cần làm**:
- [ ] Error boundary toàn app (React ErrorBoundary)
- [ ] Toast/notification system
- [ ] Loading state cho mọi async action
- [ ] Empty state cho mỗi list
- [ ] Keyboard navigation (Tab, Enter, Esc)
- [ ] ARIA labels cho screen reader
- [ ] Tooltip cho icon button
- [ ] Log file (`%APPDATA%/PCManager/logs/`)
- [ ] "Check for update" từ About
- [ ] Uninstaller sạch

**Test**:
- Tắt mạng → mở app không crash
- Click 100 lần nhanh → không leak memory
- DevTools → không error/warning
- Uninstaller trong Control Panel hoạt động

---

## 4. Quy trình Test & Debug cho MỖI task

Mỗi task kết thúc phải qua **checklist 5 bước** trước khi qua task tiếp:

1. **Build OK**: `npm run tauri build` thành công, không warning.
2. **Manual test**: Mở app, click hết chức năng task đó, check đúng UX ảnh.
3. **Edge case**:
   - Máy không có GPU rời → app không crash
   - Disk gần đầy → warning hiển thị
   - Không có quyền admin → fallback message rõ ràng
4. **Console check**: F12 DevTools, không có error đỏ.
5. **Code review tự thân**: TypeScript no `any`, Rust không `unwrap()`, prop có type, error có message.

Khi fail → quay lại fix trước khi làm task tiếp. **Không nhảy cóc**.

---

## 5. Timeline tổng (ước tính)

| Task | Nội dung | Thời gian | Trạng thái |
|---|---|---|---|
| 1 | Setup + design system | 3-4 ngày | ✅ Done |
| 2 | Onboarding | 2 ngày | ✅ Done |
| 3 | System Info | 5 ngày | ⚠️ ~20% |
| 4 | Dashboard + Monitor | 3 ngày | ⚠️ ~30% |
| 5 | Optimize | 6 ngày | ⚠️ ~10% |
| 6 | Security | 4 ngày | ❌ 0% |
| 7 | Driver | 3 ngày | ❌ 0% |
| 8 | Tools Hub | 3 ngày | ❌ 0% |
| 9 | Settings + About | 2 ngày | ⚠️ ~30% |
| 10 | Realtime + state | 1.5 ngày | ❌ 0% |
| 11 | Build + auto-update | 1.5 ngày | ❌ 0% |
| 12 | Polish | 2 ngày | ❌ 0% |
| **Tổng** | | **~36 ngày** | **~25%** |

---

## 6. Cấu trúc thư mục tạo trong project

```
pc-manager-pro/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── src/                    # React frontend
│   ├── app/
│   ├── features/
│   │   ├── onboarding/
│   │   ├── dashboard/
│   │   ├── system-info/
│   │   ├── optimize/
│   │   ├── security/
│   │   ├── driver/
│   │   ├── tools/
│   │   └── settings/
│   ├── shared/
│   ├── stores/
│   └── styles/
├── src-tauri/              # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   ├── domain/
│   │   └── infra/
│   ├── capabilities/
│   └── icons/
├── public/
└── docs/
    ├── design-tokens.md
    └── api-commands.md
```

---

## 7. Tiêu chí hoàn thành dự án

App được coi là **hoàn thành** khi:

- [ ] Tất cả 30 màn hình UX/UI clone đúng từ ảnh (theme, layout, copy tiếng Việt)
- [ ] 8 nhóm chức năng chạy đúng với Windows thật (CPU, RAM, Disk, Software, Startup, Cleaner, Booster, Defender, Driver)
- [ ] Build ra `.msi` + `.exe` cài được, size < 80MB
- [ ] App ổn định, không crash trong 30 phút sử dụng liên tục
- [ ] Có auto-update channel
- [ ] Có log/debug info khi gặp lỗi
- [ ] Code có comment tiếng Việt cho phần business logic phức tạp

---

## 8. Lệnh bắt đầu (sau khi bạn confirm)

```bash
# 1. Tạo project
cd "C:\Users\AD\Documents\New folder"
npx create-tauri-app@latest pc-manager-pro --template react-ts --manager npm
cd pc-manager-pro

# 2. Cài dependencies frontend
npm i react-router-dom zustand @tanstack/react-query recharts lucide-react framer-motion
npm i -D tailwindcss postcss autoprefixer @types/node
npx tailwindcss init -p
npx shadcn@latest init

# 3. Cài plugin Tauri
npm i @tauri-apps/plugin-store @tauri-apps/plugin-os @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-shell @tauri-apps/plugin-log @tauri-apps/plugin-updater

# 4. Cài crates Rust
cd src-tauri
cargo add sysinfo wmi windows walkdir anyhow tokio serde serde_json

# 5. Chạy dev
cd ..
npm run tauri dev
```

Sau đó tôi sẽ bắt đầu **TASK 1 → TASK 2 → ...** cho đến khi hoàn thành 12 task.
