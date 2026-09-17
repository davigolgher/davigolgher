/**
 * Central app configuration. The product name lives here only.
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

/**
 * Billing (Stripe).
 *
 * The no-backend way to take real payments from a static app is a Stripe
 * **Payment Link** — a hosted checkout URL you create in the Stripe dashboard
 * (Product → Payment link). Paste the two links below and the paywall will
 * redirect to Stripe for a real card charge; Stripe then returns the user to
 * `?checkout=success`, which unlocks the app.
 *
 * Leave them empty (the default) and the app shows a built-in, Stripe-styled
 * card form so you can see and demo the payment page now. That form does NOT
 * move money — a real charge needs a live Payment Link (or a backend that
 * creates Checkout Sessions with your Stripe *secret* key, which must never
 * live in this frontend).
 */
export const STRIPE = {
  /** e.g. "https://buy.stripe.com/xxxxxxxx" */
  monthlyPaymentLink: "",
  yearlyPaymentLink: "",
  monthlyPrice: "$4.99",
  yearlyPrice: "$39.99",
  trialDays: 7,
} as const;

/**
 * Gmail connect (Google OAuth).
 *
 * Reading a user's inbox requires Google OAuth + a server that holds the
 * token and calls the Gmail API — none of which can live safely in a static
 * frontend. Put your OAuth **client id** here once you have that backend; it
 * is safe to expose (unlike the client *secret*). Until then, "Connect Gmail"
 * runs a realistic consent flow and imports sample receipts so you can see the
 * feature end-to-end.
 */
export const GOOGLE = {
  /** e.g. "1234567890-abc.apps.googleusercontent.com" */
  clientId: "",
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
} as const;

export type AppConfig = typeof APP;
