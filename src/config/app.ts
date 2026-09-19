/**
 * Central app configuration, shared by the native app and the public pages.
 *
 * Subscription pricing deliberately lives nowhere in here: purchases go through
 * Apple In-App Purchase (via RevenueCat), and App Review requires the price and
 * period shown to the user to come from StoreKit — localized per storefront —
 * rather than being hard-coded.
 */
export const APP = {
  name: "Flow",
  tagline: "Track spending. Effortlessly.",
  version: "0.2.0",
  defaultLocale: "en-US",
  defaultCurrency: "USD",
  /**
   * Public support contact, shown on `/support`.
   *
   * App Store Connect requires a working **Support URL**, and App Review checks
   * that the contact actually reaches you. Use an address you own for the app
   * (e.g. `support@yourdomain.com`) rather than a personal inbox. Leave empty
   * and the page explains that it still needs to be set.
   */
  supportEmail: "",
  /** Legal entity shown in the legal pages. Fill before submitting. */
  company: "",
} as const;

export type AppConfig = typeof APP;
