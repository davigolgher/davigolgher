/**
 * Subscriptions, behind one seam.
 *
 * Purchases go through Apple In-App Purchase (Guideline 3.1.1 leaves no choice
 * for a digital subscription consumed in the app), wrapped by RevenueCat
 * (`react-native-purchases`).
 *
 * Which adapter runs:
 *   - a real build (TestFlight, App Store, a development build) with
 *     EXPO_PUBLIC_REVENUECAT_IOS_KEY set → RevenueCat, real StoreKit;
 *   - Expo Go, the web preview, or no key → `Unavailable`: no prices, and in
 *     development only, a way past the paywall. The SDK has a mock mode for
 *     Expo Go, but a paywall selling pretend products would make testing
 *     there look like something it isn't.
 *
 * Prices are deliberately not hard-coded anywhere. App Review requires the price
 * and period shown at the point of purchase to be the storefront's own, which
 * only StoreKit can supply, so a release build without the store shows no
 * prices at all rather than plausible-looking fiction.
 */
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import RevenueCat, {
  INTRO_ELIGIBILITY_STATUS,
  PURCHASES_ERROR_CODE,
  type PurchasesError,
  type PurchasesPackage,
} from "react-native-purchases";
import { hasEntitlement, periodLabel, trialDays } from "./purchasesFormat";

export type PlanId = "monthly" | "yearly";

export interface Plan {
  id: PlanId;
  /** Localized price as the store formats it, e.g. "US$4.99" or "R$ 24,90". */
  price: string;
  /** The same price as a number, in the storefront's currency — for comparing plans only. */
  amount: number;
  /** For the yearly plan, the store's own per-month figure ("R$ 16,66"); null otherwise. */
  perMonth: string | null;
  /** Localized period, e.g. "month". */
  period: string;
  /** Free trial length in days, 0 when there's no trial this person can still use. */
  trialDays: number;
  /** Store product identifier, for support and debugging. */
  productId: string;
}

export interface PurchaseResult {
  /** True when the user now holds the entitlement. */
  entitled: boolean;
  /** The person closed Apple's purchase sheet. Not an error; say nothing. */
  cancelled?: boolean;
  /** Waiting on approval (Ask to Buy, or a bank step). Access comes when it clears. */
  pending?: boolean;
}

export interface Purchases {
  /** False when the store can't be reached from this build (Expo Go, no key). */
  readonly available: boolean;
  /** The plans are made-up examples (development only), not the store's. */
  readonly example: boolean;
  /**
   * Tie purchases to the signed-in account — or to no one, on sign-out.
   *
   * The store's customer id becomes the Supabase user id, which is what lets
   * the RevenueCat webhook write the right `billing` row, and what makes a
   * subscription follow the account to another device.
   */
  identify(userId: string | null): Promise<void>;
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
  readonly example: boolean = false;

  async identify(): Promise<void> {}

  async getPlans(): Promise<Plan[]> {
    return [];
  }

  async purchase(): Promise<PurchaseResult> {
    throw new Error("In-app purchases need a build from EAS — they aren't available in Expo Go.");
  }

  async restore(): Promise<PurchaseResult> {
    throw new Error("Restoring purchases needs a build from EAS — it isn't available in Expo Go.");
  }

  async isEntitled(): Promise<boolean> {
    return false;
  }
}

/**
 * Development only: example prices, so the paywall — trial, savings badge and
 * all — can be seen in Expo Go, where the App Store can't be reached. The
 * screen labels them as examples; a release build never gets here.
 */
class ExamplePrices extends Unavailable {
  readonly example = true;

  async getPlans(): Promise<Plan[]> {
    return [
      // The planned US prices (see mobile/README.md → Subscriptions).
      { id: "monthly", price: "$8.99", amount: 8.99, perMonth: null, period: "month", trialDays: 14, productId: "example.monthly" },
      { id: "yearly", price: "$59.99", amount: 59.99, perMonth: "$5.00", period: "year", trialDays: 14, productId: "example.yearly" },
    ];
  }
}

/** The offering's packages that map to our two plans. */
const PACKAGE_FOR: Record<PlanId, "monthly" | "annual"> = { monthly: "monthly", yearly: "annual" };

class RevenueCatPurchases implements Purchases {
  readonly available = true;
  readonly example = false;
  /** Every call waits for the latest identify(), so nothing runs as the wrong account. */
  private ready: Promise<void> = Promise.resolve();
  private user: string | null = null;
  private packages = new Map<PlanId, PurchasesPackage>();

  constructor(apiKey: string) {
    // Anonymous until identify() names the account; logIn then carries over
    // anything bought in between.
    RevenueCat.configure({ apiKey });
  }

  identify(userId: string | null): Promise<void> {
    const run = this.ready.then(async () => {
      if (userId === this.user) return;
      if (userId) await RevenueCat.logIn(userId);
      else if (!(await RevenueCat.isAnonymous())) await RevenueCat.logOut();
      this.user = userId;
      this.packages.clear();
    });
    this.ready = run.catch(() => {});
    return run;
  }

  async getPlans(): Promise<Plan[]> {
    await this.ready;
    const offering = (await RevenueCat.getOfferings()).current;
    if (!offering) return [];

    const found: [PlanId, PurchasesPackage][] = [];
    for (const id of ["monthly", "yearly"] as PlanId[]) {
      const pkg = offering[PACKAGE_FOR[id]];
      if (pkg) found.push([id, pkg]);
    }

    // Show a trial only to someone who can still take it. Apple gives one per
    // subscription group; promising it to someone who's used theirs misstates
    // what they'll be charged.
    let eligible: Record<string, { status: INTRO_ELIGIBILITY_STATUS }> = {};
    try {
      eligible = await RevenueCat.checkTrialOrIntroductoryPriceEligibility(found.map(([, p]) => p.product.identifier));
    } catch {
      /* unknown → no trial shown; Apple's sheet still states the real terms */
    }

    this.packages = new Map(found);
    return found.map(([id, pkg]) => {
      const p = pkg.product;
      const canTrial = eligible[p.identifier]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
      return {
        id,
        price: p.priceString,
        amount: p.price,
        perMonth: id === "yearly" ? (p.pricePerMonthString ?? null) : null,
        period: periodLabel(p.subscriptionPeriod) ?? (id === "yearly" ? "year" : "month"),
        trialDays: canTrial ? trialDays(p.introPrice) : 0,
        productId: p.identifier,
      };
    });
  }

  async purchase(plan: PlanId): Promise<PurchaseResult> {
    await this.ready;
    if (!this.packages.has(plan)) await this.getPlans();
    const pkg = this.packages.get(plan);
    if (!pkg) throw new Error("This plan isn't available right now. Try again in a moment.");
    try {
      const { customerInfo } = await RevenueCat.purchasePackage(pkg);
      return { entitled: hasEntitlement(customerInfo) };
    } catch (e) {
      const err = e as PurchasesError;
      if (err?.userCancelled || err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        return { entitled: false, cancelled: true };
      }
      if (err?.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { entitled: false, pending: true };
      throw e;
    }
  }

  async restore(): Promise<PurchaseResult> {
    await this.ready;
    return { entitled: hasEntitlement(await RevenueCat.restorePurchases()) };
  }

  async isEntitled(): Promise<boolean> {
    await this.ready;
    return hasEntitlement(await RevenueCat.getCustomerInfo());
  }
}

/** The public RevenueCat key for iOS ("appl_…"). Public by design, like the Supabase anon key. */
export const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim() || null;

function load(): Purchases {
  const noStore = () => (__DEV__ ? new ExamplePrices() : new Unavailable());
  if (Platform.OS !== "ios" || !REVENUECAT_IOS_KEY) return noStore();
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return noStore(); // Expo Go
  try {
    return new RevenueCatPurchases(REVENUECAT_IOS_KEY);
  } catch {
    return new Unavailable();
  }
}

export const purchases: Purchases = load();
