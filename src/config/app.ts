/**
 * Central app configuration. The product name lives here only.
 */
export const APP = {
  name: "SmartFlow",
  tagline: "Track spending. Effortlessly.",
  version: "0.2.0",
  defaultLocale: "en-US",
  defaultCurrency: "USD",
} as const;

export type AppConfig = typeof APP;
