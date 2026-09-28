/**
 * Test stand-in for `react-native-purchases`: a fake store that remembers which
 * app user id it is acting for and under which ids purchases were made.
 *
 * The state lives on globalThis so it survives `vi.resetModules()`, which is
 * how a test simulates relaunching the app; `resetFakeStore()` clears it.
 */
export const INTRO_ELIGIBILITY_STATUS = {
  INTRO_ELIGIBILITY_STATUS_UNKNOWN: 0,
  INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1,
  INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2,
  INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS: 3,
} as const;

export const PURCHASES_ERROR_CODE = { PURCHASE_CANCELLED_ERROR: "1", PAYMENT_PENDING_ERROR: "20" } as const;

export interface FakeStore {
  appUserID: string;
  online: boolean;
  entitled: Set<string>;
  /** "buy:<id>" / "restore:<id>", in order. */
  log: string[];
}

const g = globalThis as { __fakeRevenueCat?: FakeStore };

export function resetFakeStore(): FakeStore {
  g.__fakeRevenueCat = { appUserID: "$RCAnonymousID:device", online: true, entitled: new Set(), log: [] };
  return g.__fakeRevenueCat;
}

export const fakeStore = (): FakeStore => g.__fakeRevenueCat ?? resetFakeStore();

function reachable(): void {
  if (!fakeStore().online) throw new Error("The Internet connection appears to be offline.");
}

const info = () => ({ entitlements: { active: fakeStore().entitled.has(fakeStore().appUserID) ? { pro: {} } : {} } });

const product = (identifier: string, price: number) => ({
  identifier,
  price,
  priceString: `$${price}`,
  pricePerMonthString: null,
  subscriptionPeriod: identifier.includes("year") ? "P1Y" : "P1M",
  introPrice: null,
});

const RevenueCat = {
  configure(): void {},
  async logIn(id: string) {
    reachable();
    fakeStore().appUserID = id;
    return { customerInfo: info(), created: false };
  },
  async logOut() {
    reachable();
    fakeStore().appUserID = "$RCAnonymousID:fresh";
    return info();
  },
  async isAnonymous() {
    return fakeStore().appUserID.startsWith("$RCAnonymousID:");
  },
  async getAppUserID() {
    return fakeStore().appUserID;
  },
  async getCustomerInfo() {
    return info();
  },
  async getOfferings() {
    return {
      current: {
        monthly: { product: product("flow.monthly", 8.99) },
        annual: { product: product("flow.yearly", 69.99) },
      },
    };
  },
  async checkTrialOrIntroductoryPriceEligibility() {
    return {};
  },
  async purchasePackage() {
    reachable();
    fakeStore().log.push(`buy:${fakeStore().appUserID}`);
    fakeStore().entitled.add(fakeStore().appUserID);
    return { customerInfo: info() };
  },
  async restorePurchases() {
    reachable();
    fakeStore().log.push(`restore:${fakeStore().appUserID}`);
    return info();
  },
};

export default RevenueCat;
