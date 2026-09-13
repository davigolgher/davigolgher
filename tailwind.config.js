/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light theme (SmartFlow). Names kept for compatibility:
        // `ink` = surfaces (now light), `chalk` = text (now dark).
        ink: {
          950: "#FFFFFF",
          900: "#FBFBFB",
          850: "#FFFFFF",
          800: "#F5F5F6",
          750: "#F1F1F2",
          700: "#E7E7E9",
          600: "#D6D6DA",
        },
        chalk: {
          DEFAULT: "#0A0A0A",
          soft: "#3F3F46",
          mute: "#8E8E93",
          faint: "#AEAEB4",
        },
        line: {
          DEFAULT: "rgba(0,0,0,0.10)",
          soft: "rgba(0,0,0,0.06)",
          strong: "rgba(0,0,0,0.16)",
        },
        accent: "#0A0A0A",
      },
      borderRadius: {
        card: "24px",
        "card-sm": "18px",
        field: "16px",
        button: "16px",
        sheet: "28px",
        pill: "9999px",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Inter",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      fontSize: {
        metric: ["3rem", { lineHeight: "1", letterSpacing: "-0.03em", fontWeight: "600" }],
        "metric-sm": ["1.75rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "600" }],
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.1em", fontWeight: "600" }],
      },
      spacing: { 18: "4.5rem", 22: "5.5rem" },
      maxWidth: { app: "480px", reader: "760px" },
      transitionTimingFunction: { premium: "cubic-bezier(0.22, 1, 0.36, 1)" },
      keyframes: {
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(12px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        flame: {
          "0%, 100%": { transform: "scale(1) rotate(-1.5deg)", opacity: "0.85" },
          "50%": { transform: "scale(1.14) rotate(1.5deg)", opacity: "1" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.4)", opacity: "0" },
          "70%": { transform: "scale(1.12)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
        "fade-in": "fade-in 250ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-up": "fade-up 250ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scale-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "toast-in": "toast-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both",
        flame: "flame 1.5s ease-in-out infinite",
        "pop-in": "pop-in 360ms cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
