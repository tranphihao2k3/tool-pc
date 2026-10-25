import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import "./styles/globals.css";
import "./locales/i18n";
import { useSettingsStore } from "./features/settings/settingsStore";

/**
 * Subscribe trực tiếp tới settings store để áp dụng font-size + language
 * lên <html> ngay khi user đổi. Tách ra ngoài <App> để chạy trước khi
 * App render, tránh flash font mặc định.
 */
function GlobalSettingsSync() {
  const fontSize = useSettingsStore((s) => s.settings.ui.fontSize);
  const language = useSettingsStore((s) => s.settings.ui.language);
  if (typeof document !== "undefined") {
    document.documentElement.style.fontSize = `${fontSize}px`;
    document.documentElement.lang = language;
  }
  return null;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <GlobalSettingsSync />
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
