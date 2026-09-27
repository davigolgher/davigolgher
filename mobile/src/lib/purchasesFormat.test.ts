import { describe, expect, it } from "vitest";
import { hasEntitlement, periodLabel, trialDays } from "./purchasesFormat";

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
