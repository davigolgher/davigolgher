/**
 * The parts of the purchase flow that are plain logic: turning what StoreKit
 * reports (through RevenueCat) into the words the paywall shows, and reading
 * whether an account has access. No SDK imports, so they're tested directly.
 */

/** The RevenueCat entitlement both plans unlock. Must match the dashboard. */
export const ENTITLEMENT = "pro";

const UNIT_WORD: Record<string, [string, string]> = {
  D: ["day", "days"],
  W: ["week", "weeks"],
  M: ["month", "months"],
  Y: ["year", "years"],
};

/**
 * "P1M" → "month", "P3M" → "3 months", "P1Y" → "year". The paywall writes
 * "R$ 24,90 / month" and "renews at R$ 24,90 per month", so a single period
 * reads without its number. Null for anything StoreKit didn't describe.
 */
export function periodLabel(iso: string | null | undefined): string | null {
  const m = /^P(\d+)([DWMY])$/.exec(iso ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  const [one, many] = UNIT_WORD[m[2]];
  return n === 1 ? one : `${n} ${many}`;
}

export interface IntroLike {
  price: number;
  cycles: number;
  periodUnit: string;
  periodNumberOfUnits: number;
}

const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/**
 * Length of the free trial in days, or 0.
 *
 * Only a free introductory offer counts: a discounted first month is not a
 * trial, and calling it one on the paywall would misstate what gets charged.
 */
export function trialDays(intro: IntroLike | null | undefined): number {
  if (!intro || intro.price !== 0) return 0;
  const unit = UNIT_DAYS[intro.periodUnit.toUpperCase()];
  if (!unit) return 0;
  return unit * Math.max(1, intro.periodNumberOfUnits) * Math.max(1, intro.cycles);
}

/** Whether RevenueCat's customer info grants the app's entitlement right now. */
export function hasEntitlement(info: { entitlements: { active: Record<string, unknown> } } | null | undefined): boolean {
  return Boolean(info?.entitlements.active[ENTITLEMENT]);
}
