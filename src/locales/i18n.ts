import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import vi from "./vi.json";
import en from "./en.json";

const lang =
  (typeof window !== "undefined" && localStorage.getItem("lang")) ||
  (typeof navigator !== "undefined" && navigator.language?.startsWith("vi")
    ? "vi"
    : "en");

i18n
  .use(initReactI18next)
  .init({
    resources: { vi: { translation: vi }, en: { translation: en } },
    lng: lang,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

export default i18n;
