import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/shared/components/AppShell";

// Lazy load pages để giảm bundle size ban đầu
const OnboardingPage = lazy(() => import("@/features/onboarding/OnboardingPage"));
const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
const SystemOverviewPage = lazy(() => import("@/features/system-info/SystemOverviewPage"));
const CpuPage = lazy(() => import("@/features/system-info/CpuPage"));
const RamPage = lazy(() => import("@/features/system-info/RamPage"));
const MainboardPage = lazy(() => import("@/features/system-info/MainboardPage"));
const DiskPage = lazy(() => import("@/features/system-info/DiskPage"));
const GpuPage = lazy(() => import("@/features/system-info/GpuPage"));
const NetworkPage = lazy(() => import("@/features/system-info/NetworkPage"));
const SoftwarePage = lazy(() => import("@/features/system-info/SoftwarePage"));
const StartupPage = lazy(() => import("@/features/system-info/StartupPage"));
const CleanerPage = lazy(() => import("@/features/optimize/CleanerPage"));
const BoosterPage = lazy(() => import("@/features/optimize/BoosterPage"));
const RepairPage = lazy(() => import("@/features/optimize/RepairPage"));
const SecurityPage = lazy(() => import("@/features/security/SecurityPage"));
const DriverPage = lazy(() => import("@/features/driver/DriverPage"));
const ToolsPage = lazy(() => import("@/features/tools/ToolsPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));
const WindowsConfigPage = lazy(
  () => import("@/features/windows-config/WindowsConfigPage")
);

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Onboarding hiển thị full-screen, không có shell */}
        <Route path="/onboarding/*" element={<OnboardingPage />} />

        {/* Tất cả các trang còn lại nằm trong AppShell (sidebar + topbar) */}
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/system" element={<SystemOverviewPage />} />
          <Route path="/system/cpu" element={<CpuPage />} />
          <Route path="/system/ram" element={<RamPage />} />
          <Route path="/system/mainboard" element={<MainboardPage />} />
          <Route path="/system/disk" element={<DiskPage />} />
          <Route path="/system/gpu" element={<GpuPage />} />
          <Route path="/system/network" element={<NetworkPage />} />
          <Route path="/system/software" element={<SoftwarePage />} />
          <Route path="/system/startup" element={<StartupPage />} />
          <Route path="/optimize/cleaner" element={<CleanerPage />} />
          <Route path="/optimize/booster" element={<BoosterPage />} />
          <Route path="/optimize/repair" element={<RepairPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/driver" element={<DriverPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/windows-config" element={<WindowsConfigPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
