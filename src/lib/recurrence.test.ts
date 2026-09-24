import { describe, it, expect } from "vitest";
import {
  addPeriods,
  advanceCharge,
  annualEquivalent,
  daysUntil,
  daysUntilCharge,
  monthlyEquivalent,
  nextChargeDate,
  upcomingChargeDates,
} from "./recurrence";

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

describe("recurrence — charges after the first", () => {
  const sub = (nextChargeAt: string, frequency: "monthly" | "yearly" | "weekly" = "monthly") => ({
    frequency,
    amount: 1599,
    nextChargeAt,
  });

  it("keeps the day of the month through short months", () => {
    const jan31 = new Date(2026, 0, 31, 12).toISOString();
    expect(addPeriods(jan31, "monthly", 1).toDateString()).toBe(new Date(2026, 1, 28).toDateString());
    expect(addPeriods(jan31, "monthly", 2).toDateString()).toBe(new Date(2026, 2, 31).toDateString());
    expect(new Date(advanceCharge(jan31, "monthly")).getDate()).toBe(28);
  });

  it("lands a 29 February renewal on the 28th in other years", () => {
    const leap = new Date(2028, 1, 29, 12).toISOString();
    expect(addPeriods(leap, "yearly", 1).toDateString()).toBe(new Date(2029, 1, 28).toDateString());
    expect(addPeriods(leap, "yearly", 4).toDateString()).toBe(new Date(2032, 1, 29).toDateString());
  });

  it("moves a past first charge on to the next one", () => {
    const now = new Date(2026, 8, 23, 10);
    const s = sub(new Date(2026, 7, 10, 12).toISOString());
    expect(nextChargeDate(s, now)?.toDateString()).toBe(new Date(2026, 9, 10).toDateString());
    expect(daysUntilCharge(s, now)).toBe(17);
  });

  it("counts a charge due today as today, not next month", () => {
    const now = new Date(2026, 8, 10, 18);
    expect(daysUntilCharge(sub(new Date(2026, 7, 10, 8).toISOString()), now)).toBe(0);
  });

  it("leaves a future first charge alone", () => {
    const now = new Date(2026, 8, 23, 10);
    const first = new Date(2026, 9, 1, 12);
    expect(nextChargeDate(sub(first.toISOString()), now)?.getTime()).toBe(first.getTime());
  });

  it("handles anchors years back without drifting", () => {
    const now = new Date(2026, 8, 23, 10);
    expect(nextChargeDate(sub(new Date(2019, 0, 31, 12).toISOString()), now)?.toDateString()).toBe(
      new Date(2026, 8, 30).toDateString(),
    );
    const weekly = nextChargeDate(sub(new Date(2020, 0, 1, 12).toISOString(), "weekly"), now)!;
    expect(weekly.getDay()).toBe(new Date(2020, 0, 1).getDay());
    expect(daysUntilCharge(sub(new Date(2020, 0, 1, 12).toISOString(), "weekly"), now)).toBeLessThan(7);
  });

  it("lists the charges after the next", () => {
    const now = new Date(2026, 8, 23, 10);
    const dates = upcomingChargeDates(sub(new Date(2026, 0, 31, 12).toISOString()), now, 3);
    expect(dates.map((d) => d.toDateString())).toEqual(
      [new Date(2026, 8, 30), new Date(2026, 9, 31), new Date(2026, 10, 30)].map((d) => d.toDateString()),
    );
  });

  it("returns nothing for an unreadable date", () => {
    expect(nextChargeDate(sub("not a date"))).toBeNull();
  });
});
