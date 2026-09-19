/**
 * Design tokens ported from the web app's tailwind.config.js so the app looks
 * like the same product. Values are in px rather than rem — React Native has no
 * root font size to scale against.
 *
 * Note the inverted naming kept from the web app: `ink` = surfaces (light),
 * `chalk` = text (dark).
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
      fontSize: {
        metric: ["48px", { lineHeight: "48px", letterSpacing: "-1.44px" }],
        "metric-sm": ["28px", { lineHeight: "29px", letterSpacing: "-0.56px" }],
        eyebrow: ["11px", { lineHeight: "11px", letterSpacing: "1.1px" }],
      },
      spacing: { 18: "72px", 22: "88px" },
    },
  },
  plugins: [],
};
