/**
 * Design tokens ported from the web app's tailwind.config.js so the app looks
 * like the same product. Values are in px rather than rem — React Native has no
 * root font size to scale against.
 *
 * The values themselves live in src/theme/tokens.js, which code can import
 * too (icon colours, switch tracks), so a colour is written down once.
 *
 * Note the inverted naming kept from the web app: `ink` = surfaces (light),
 * `chalk` = text (dark).
 */
const { colors, borderRadius, fontSize, spacing } = require("./src/theme/tokens");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: { colors, borderRadius, fontSize, spacing },
  },
  plugins: [],
};
