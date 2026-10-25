import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { ErrorBoundary } from "./ErrorBoundary";
import { ToastContainer } from "./Toast";

export function AppShell() {
  const location = useLocation();

  // Reset focus to main content khi route đổi (a11y + UX)
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) {
      // Set tabindex -1 tạm thời để focus programmatic hoạt động
      main.setAttribute("tabindex", "-1");
      // Không steal focus nếu user đang dùng input
      const active = document.activeElement;
      if (
        !active ||
        active === document.body ||
        (active.tagName !== "INPUT" &&
          active.tagName !== "TEXTAREA" &&
          active.tagName !== "SELECT")
      ) {
        main.focus({ preventScroll: false });
      }
    }
  }, [location.pathname]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      <AppSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar />

        {/* Skip link — cho screen reader + keyboard user nhảy thẳng vào content */}
        <a
          href="#main-content"
          className="
            sr-only focus:not-sr-only
            focus:absolute focus:left-2 focus:top-2 focus:z-50
            focus:rounded-md focus:bg-brand focus:px-3 focus:py-1.5
            focus:text-sm focus:font-medium focus:text-white
            focus:shadow-lg
          "
        >
          Chuyển đến nội dung chính
        </a>

        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Nội dung chính"
          className="flex-1 overflow-y-auto p-6 focus:outline-none"
        >
          {/* ErrorBoundary wrap mỗi route — 1 page crash không kéo sập app */}
          <ErrorBoundary
            scope={
              location.pathname === "/"
                ? "Dashboard"
                : location.pathname.split("/").filter(Boolean).join("/") || "App"
            }
            key={location.pathname}
          >
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Toast portal — hiển thị nổi trên tất cả các trang */}
      <ToastContainer />
    </div>
  );
}
