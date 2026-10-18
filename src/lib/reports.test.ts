import { describe, it, expect } from "vitest";
import { categoryBreakdown, monthlyTotals } from "./reports";
import type { Transaction } from "@/data/types";

const NOW = new Date("2026-09-15T12:00:00");

function tx(
  date: string,
  amount: number,
  direction: Transaction["direction"] = "expense",
  categoryId = "other",
): Transaction {
  return {
    id: Math.random().toString(36),
    amount,
    direction,
    description: "x",
    categoryId,
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

describe("reports — categoryBreakdown", () => {
  it("shares that land on .5 still add up to 100", () => {
    // $10,000 and $6,000 each rounded up, to 63% and 38%, and the donut drew
    // 101% of a circle — the overflow ran over the gap between the slices.
    const slices = categoryBreakdown(
      [
        tx("2026-09-03T10:00:00", 1000000, "expense", "investments"),
        tx("2026-09-04T10:00:00", 600000, "expense", "clothes"),
      ],
      NOW,
    );
    expect(slices.map((s) => s.pct)).toEqual([63, 37]);
  });

  it("never totals more or less than 100, however the shares fall", () => {
    const slices = categoryBreakdown(
      ["a", "b", "c"].map((c, i) => tx("2026-09-0" + (i + 1) + "T10:00:00", 3333, "expense", c)),
      NOW,
    );
    expect(slices.reduce((a, s) => a + s.pct, 0)).toBe(100);
  });

  it("orders by amount and ignores income and other months", () => {
    const slices = categoryBreakdown(
      [
        tx("2026-09-03T10:00:00", 2000, "expense", "food"),
        tx("2026-09-04T10:00:00", 8000, "expense", "rent"),
        tx("2026-09-05T10:00:00", 50000, "income", "salary"),
        tx("2026-08-30T10:00:00", 9900, "expense", "old"),
      ],
      NOW,
    );
    expect(slices).toEqual([
      { category: "rent", total: 8000, pct: 80 },
      { category: "food", total: 2000, pct: 20 },
    ]);
  });

  it("gives a lone category the whole ring", () => {
    const slices = categoryBreakdown([tx("2026-09-03T10:00:00", 1234, "expense", "food")], NOW);
    expect(slices).toEqual([{ category: "food", total: 1234, pct: 100 }]);
  });
});
