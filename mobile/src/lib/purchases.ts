/**
 * Subscriptions, behind one seam.
 *
 * Purchases go through Apple In-App Purchase (Guideline 3.1.1 leaves no choice
 * for a digital subscription consumed in the app), wrapped by RevenueCat. That
 * means `react-native-purchases`, which is **not** bundled in Expo Go — adding
 * it would end testing over a QR code and force a development build for every
 * change.
 *
 * So the store is reached through this adapter instead. Today it reports itself
 * unavailable; wiring RevenueCat is the `loadNativePurchases` function below and
 * nothing else. Everything on top — the paywall, the gate, the entitlement
 * check — is finished and will not need revisiting.
 *
 * Prices are deliberately not hard-coded anywhere. App Review requires the price
 * and period shown at the point of purchase to be the storefront's own, which
 * only StoreKit can supply, so a release build without the native module shows
 * no prices at all rather than plausible-looking fiction.
 */

export type PlanId = "monthly" | "yearly";

export interface Plan {
  id: PlanId;
  /** Localized price as the store formats it, e.g. "US$4.99" or "R$ 24,90". */
  price: string;
  /** Localized period, e.g. "month". */
  period: string;
  /** Free trial length in days, 0 when the product has no intro offer. */
  trialDays: number;
  /** Store product identifier, for support and debugging. */
  productId: string;
}

export interface PurchaseResult {
  /** True when the user now holds the entitlement. */
  entitled: boolean;
}

export interface Purchases {
  /** False when the native module isn't present (Expo Go) or isn't configured. */
  readonly available: boolean;
  /** Plans as the store describes them. Empty when unavailable. */
  getPlans(): Promise<Plan[]>;
  purchase(plan: PlanId): Promise<PurchaseResult>;
  /** Apple requires a restore path for previously bought subscriptions. */
  restore(): Promise<PurchaseResult>;
  /** Whether the signed-in user currently holds the entitlement. */
  isEntitled(): Promise<boolean>;
}

class Unavailable implements Purchases {
  readonly available = false;

  async getPlans(): Promise<Plan[]> {
    return [];
  }

  async purchase(): Promise<PurchaseResult> {
    throw new Error("In-app purchases need a native build — they aren't available in Expo Go.");
  }

  async restore(): Promise<PurchaseResult> {
    throw new Error("Restoring purchases needs a native build — it isn't available in Expo Go.");
  }

  async isEntitled(): Promise<boolean> {
    return false;
  }
}

/**
 * Swap in RevenueCat here once `react-native-purchases` is installed and the
 * App Store Connect products exist. The rest of the app doesn't change.
 *
 *   import Purchases from "react-native-purchases";
 *   await Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY });
 *   await Purchases.logIn(supabaseUserId);   // ties the purchase to the account
 *
 * `getPlans` reads `Purchases.getOfferings()`, taking `product.priceString` and
 * the intro offer for the trial — never a literal from this repo. `isEntitled`
 * reads `customerInfo.entitlements.active["pro"]`.
 *
 * See mobile/README.md for the full setup, and `supabase/functions/
 * revenuecat-webhook` for how the entitlement reaches the database.
 */
function loadNativePurchases(): Purchases | null {
  return null;
}

export const purchases: Purchases = loadNativePurchases() ?? new Unavailable();
