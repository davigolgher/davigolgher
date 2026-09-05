import { describe, it, expect } from "vitest";
import { advanceCharge, annualEquivalent, daysUntil, monthlyEquivalent } from "./recurrence";

const base = { nextChargeAt: new Date().toISOString() };

describe("recurrence — equivalences and dates", () => {
  it("computes monthly equivalent per frequency", () => {
    expect(monthlyEquivalent({ ...base, frequency: "monthly", amount: 1000 })).toBe(1000);
    expect(monthlyEquivalent({ ...base, frequency: "yearly", amount: 12000 })).toBe(1000);
    expect(monthlyEquivalent({ ...base, frequency: "weekly", amount: 1000 })).toBe(4333);
  });

  it("computes annual equivalent per frequency", () => {
    expect(annualEquivalent({ ...base, frequency: "monthly", amount: 1000 })).toBe(12000);
    expect(annualEquivalent({ ...base, frequency: "yearly", amount: 12000 })).toBe(12000);
    expect(annualEquivalent({ ...base, frequency: "weekly", amount: 1000 })).toBe(52000);
  });

  it("advances the charge date by frequency", () => {
    const start = "2026-01-15T09:00:00.000Z";
    expect(new Date(advanceCharge(start, "monthly")).getMonth()).toBe(1);
    expect(new Date(advanceCharge(start, "yearly")).getFullYear()).toBe(2027);
  });

  it("counts days until a date", () => {
    const from = new Date("2026-07-26T10:00:00");
    expect(daysUntil("2026-07-29T09:00:00", from)).toBe(3);
    expect(daysUntil("2026-07-26T23:00:00", from)).toBe(0);
  });
});
