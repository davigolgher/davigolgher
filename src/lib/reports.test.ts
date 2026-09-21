import { describe, it, expect } from "vitest";
import { monthlyTotals } from "./reports";
import type { Transaction } from "@/data/types";

const NOW = new Date("2026-09-15T12:00:00");

function tx(date: string, amount: number, direction: Transaction["direction"] = "expense"): Transaction {
  return {
    id: Math.random().toString(36),
    amount,
    direction,
    description: "x",
    categoryId: "other",
    date,
    currency: "USD",
  };
}

describe("reports — monthlyTotals", () => {
  it("returns the whole window even when only one month has spending", () => {
    // The chart drew a single unconnected point before this: months without
    // expenses were dropped entirely instead of coming back as zero.
    const months = monthlyTotals([tx("2026-09-03T10:00:00", 20000)], "en-US", 6, NOW);
    expect(months).toHaveLength(6);
    expect(months.filter((m) => m.total > 0)).toHaveLength(1);
  });

  it("runs oldest to newest, ending with the current month", () => {
    const months = monthlyTotals([], "en-US", 6, NOW);
    expect(months.map((m) => m.key)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("sums a month's expenses and ignores income", () => {
    const months = monthlyTotals(
      [
        tx("2026-09-01T10:00:00", 1000),
        tx("2026-09-20T10:00:00", 2500),
        tx("2026-09-10T10:00:00", 90000, "income"),
      ],
      "en-US",
      6,
      NOW,
    );
    expect(months[months.length - 1].total).toBe(3500);
  });

  it("crosses a year boundary without gaps", () => {
    const months = monthlyTotals([], "en-US", 4, new Date("2026-02-10T12:00:00"));
    expect(months.map((m) => m.key)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
