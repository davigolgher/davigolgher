/**
 * The design tokens, in one place: tailwind.config.js builds the class names
 * from these, and code that needs a raw value (an icon's colour, a switch's
 * track, a chart) imports them from here instead of repeating a hex code.
 *
 * Note the inverted naming kept from the web app: `ink` = surfaces (light),
 * `chalk` = text (dark).
 *
 * CommonJS on purpose: Tailwind's config is loaded by Node, the app by Metro,
 * and both can read this file.
 */

const colors = {
  ink: {
    950: "#FFFFFF",
    900: "#FBFBFB",
    850: "#FFFFFF",
    800: "#F5F5F6",
    750: "#F1F1F2",
    700: "#E7E7E9",
    600: "#D6D6DA",
  },
  // Contrast on white (WCAG): chalk 19.4:1, soft 10.4:1, mute 5.1:1 — every
  // size of text passes AA from mute up. faint is 3.4:1: enough for large
  // text, icons and placeholders, not for small text, so small text never
  // uses it. (mute was #8E8E93 at 3.3:1 and faint #AEAEB4 at 2.2:1.)
  chalk: {
    DEFAULT: "#0A0A0A",
    soft: "#3F3F46",
    mute: "#6E6E73",
    faint: "#8A8A8F",
  },
  line: {
    DEFAULT: "rgba(0,0,0,0.10)",
    soft: "rgba(0,0,0,0.06)",
    strong: "rgba(0,0,0,0.16)",
  },
  accent: "#0A0A0A",
  // Flow is monochrome; these are the only colours that carry meaning, and
  // only where a state must not be missed (a connection that stopped, money
  // over a limit). Each passes AA as text on white and on its own tint.
  signal: {
    alert: "#B42318",
    "alert-tint": "#FEF3F2",
    ok: "#067647",
    "ok-tint": "#ECFDF3",
    warn: "#93370D",
    "warn-tint": "#FFFAEB",
  },
};

const borderRadius = {
  card: "24px",
  "card-sm": "18px",
  field: "16px",
  button: "16px",
  sheet: "28px",
  pill: "9999px",
};

/**
 * Type scale. `metric`, `metric-sm` and `eyebrow` were the original tokens;
 * the rest name the sizes the app's screens already use (15pt rows, 13pt
 * secondary lines, 12pt footers…), so new screens can say `text-body` rather
 * than `text-[15px]`. Sizes are points; iOS scales them with Dynamic Type.
 */
const fontSize = {
  metric: ["48px", { lineHeight: "48px", letterSpacing: "-1.44px" }],
  "metric-sm": ["28px", { lineHeight: "29px", letterSpacing: "-0.56px" }],
  eyebrow: ["11px", { lineHeight: "11px", letterSpacing: "1.1px" }],
  title: ["26px", { lineHeight: "31px", letterSpacing: "-0.4px" }],
  headline: ["17px", { lineHeight: "22px" }],
  callout: ["16px", { lineHeight: "21px" }],
  body: ["15px", { lineHeight: "20px" }],
  subhead: ["14px", { lineHeight: "19px" }],
  footnote: ["13px", { lineHeight: "18px" }],
  caption: ["12px", { lineHeight: "16px" }],
  micro: ["11px", { lineHeight: "13px" }],
};

/** The same sizes as numbers, for icons and anything drawn in code. */
const iconSize = { sm: 16, md: 18, lg: 20, xl: 24, hero: 40 };

const spacing = { 18: "72px", 22: "88px" };

/** Screen gutters, in points, matching useTabScreenPadding. */
const layout = { gutter: 24, sectionGap: 32 };

module.exports = { colors, borderRadius, fontSize, iconSize, spacing, layout };
