import { describe, expect, it } from "vitest";
import { hasEntitlement, monthsFreeOnYearly, periodLabel, trialDays, yearlySavingsPercent } from "./purchasesFormat";

describe("purchase wording", () => {
  it("names a single period without its number", () => {
    expect(periodLabel("P1M")).toBe("month");
    expect(periodLabel("P1Y")).toBe("year");
    expect(periodLabel("P1W")).toBe("week");
    expect(periodLabel("P3M")).toBe("3 months");
    expect(periodLabel("P6M")).toBe("6 months");
  });

  it("returns null for a period StoreKit didn't describe", () => {
    expect(periodLabel(null)).toBeNull();
    expect(periodLabel("")).toBeNull();
    expect(periodLabel("monthly")).toBeNull();
  });

  it("counts only a free intro offer as a trial", () => {
    expect(trialDays({ price: 0, cycles: 1, periodUnit: "WEEK", periodNumberOfUnits: 1 })).toBe(7);
    expect(trialDays({ price: 0, cycles: 1, periodUnit: "DAY", periodNumberOfUnits: 3 })).toBe(3);
    expect(trialDays({ price: 0, cycles: 1, periodUnit: "MONTH", periodNumberOfUnits: 1 })).toBe(30);
    // A cheaper first month is a discount, not a free trial.
    expect(trialDays({ price: 0.99, cycles: 1, periodUnit: "MONTH", periodNumberOfUnits: 1 })).toBe(0);
    expect(trialDays(null)).toBe(0);
  });

  it("reads access from the pro entitlement only", () => {
    expect(hasEntitlement({ entitlements: { active: { pro: {} } } })).toBe(true);
    expect(hasEntitlement({ entitlements: { active: {} } })).toBe(false);
    expect(hasEntitlement({ entitlements: { active: { other: {} } } })).toBe(false);
    expect(hasEntitlement(null)).toBe(false);
  });
});

describe("yearly plan, in honest numbers", () => {
  it("computes the saving from the store's prices, rounded down", () => {
    // R$ 29,90 a month is R$ 358,80 a year; R$ 199,90 is 44.28% less.
    expect(yearlySavingsPercent(29.9, 199.9)).toBe(44);
    expect(monthsFreeOnYearly(29.9, 199.9)).toBe(5);
    expect(yearlySavingsPercent(4.99, 39.99)).toBe(33);
    expect(monthsFreeOnYearly(4.99, 39.99)).toBe(3);
    // Flow's planned prices: US$ 8.99 a month, US$ 59.99 a year (107.88 → 44.39% less).
    expect(yearlySavingsPercent(8.99, 59.99)).toBe(44);
    expect(monthsFreeOnYearly(8.99, 59.99)).toBe(5);
  });

  it("claims nothing when yearly isn't cheaper or a price is missing", () => {
    expect(yearlySavingsPercent(10, 120)).toBeNull();
    expect(yearlySavingsPercent(10, 130)).toBeNull();
    expect(monthsFreeOnYearly(10, 115)).toBeNull();
    expect(yearlySavingsPercent(null, 99)).toBeNull();
    expect(monthsFreeOnYearly(9.99, undefined)).toBeNull();
  });
});
