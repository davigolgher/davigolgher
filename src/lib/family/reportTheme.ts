/**
 * The report's colours, from the app's design tokens (mobile/src/theme/tokens.js):
 * chalk for text, chalk-mute for secondary text, line for rules, signal-alert
 * for "over budget". Repeated here only because this module also runs in the
 * web project, which can't reach the mobile folder; a test keeps them equal.
 */
export const colors = {
  text: "#0A0A0A",
  muted: "#6E6E73",
  line: "rgba(0,0,0,0.10)",
  alert: "#B42318",
} as const;
