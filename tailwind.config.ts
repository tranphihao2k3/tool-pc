import type { Config } from "tailwindcss";

/**
 * Design tokens cloned từ UX/UI screenshots.
 * Theme: dark mode, gradient tím → xanh dương, accent cyan xanh ngọc.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Base
        bg: {
          DEFAULT: "#0B0F1A",
          50: "#0F1424",
          100: "#131933",
          200: "#1A2244",
          300: "#222B55",
        },
        // Surface (cards)
        surface: {
          DEFAULT: "#131933",
          50: "#0F1424",
          100: "#1A2244",
          200: "#222B55",
        },
        // Primary brand
        brand: {
          DEFAULT: "#7C5CFF",
          50: "#5A3FD9",
          100: "#7C5CFF",
          200: "#9C7FFF",
          300: "#B89FFF",
        },
        // Accent (cyan)
        accent: {
          DEFAULT: "#22D3EE",
          50: "#0EA5E9",
          100: "#22D3EE",
        },
        // Semantic
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#3B82F6",
        // Text
        ink: {
          DEFAULT: "#E5E7EB",
          muted: "#9CA3AF",
          subtle: "#6B7280",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #7C5CFF 0%, #22D3EE 100%)",
        "brand-gradient-soft":
          "linear-gradient(135deg, rgba(124,92,255,0.18) 0%, rgba(34,211,238,0.18) 100%)",
        "card-glow":
          "radial-gradient(circle at top right, rgba(124,92,255,0.18), transparent 60%)",
      },
      boxShadow: {
        glow: "0 0 24px rgba(124, 92, 255, 0.35)",
        "glow-cyan": "0 0 24px rgba(34, 211, 238, 0.35)",
        card: "0 4px 24px rgba(0, 0, 0, 0.35)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "gradient-x": "gradient-x 8s ease infinite",
      },
      keyframes: {
        "gradient-x": {
          "0%,100%": { "background-position": "0% 50%" },
          "50%": { "background-position": "100% 50%" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
