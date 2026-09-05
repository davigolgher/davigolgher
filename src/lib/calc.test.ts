import { describe, it, expect } from "vitest";
import {
  budgetProgress,
  compare,
  groupByDay,
  subscriptionInsights,
  subscriptionsMonthlyTotal,
  totalPrevMonth,
  totalThisMonth,
} from "./calc";
import type { Subscription, Transaction } from "@/data/types";

const NOW = new Date("2026-07-15T12:00:00");

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36),
    amount: 0,
    direction: "expense",
    description: "x",
    categoryId: "other",
    date: NOW.toISOString(),
    currency: "USD",
    ...partial,
  };
}

function sub(partial: Partial<Subscription>): Subscription {
  return {
    id: Math.random().toString(36),
    name: "S",
    amount: 0,
    currency: "USD",
    frequency: "monthly",
    nextChargeAt: NOW.toISOString(),
    status: "active",
    categoryId: "Subscriptions",
    reminders: false,
    ...partial,
  };
}

describe("calc — totals and comparisons", () => {
  it("sums this month and previous month separately", () => {
    const txs = [
      tx({ amount: 1000, date: "2026-07-02T10:00:00" }),
      tx({ amount: 2000, date: "2026-07-10T10:00:00" }),
      tx({ amount: 500, date: "2026-06-20T10:00:00" }),
    ];
    expect(totalThisMonth(txs, NOW)).toBe(3000);
    expect(totalPrevMonth(txs, NOW)).toBe(500);
  });

  it("ignores income in spending totals", () => {
    const txs = [tx({ amount: 1000 }), tx({ amount: 9999, direction: "income" })];
    expect(totalThisMonth(txs, NOW)).toBe(1000);
  });

  it("compares periods with direction and percentage", () => {
    expect(compare(248000, 229600)).toEqual({ direction: "up", pct: 8 });
    expect(compare(100, 200)).toEqual({ direction: "down", pct: 50 });
    expect(compare(100, 100)).toEqual({ direction: "flat", pct: 0 });
  });

  it("groups transactions by day", () => {
    const groups = groupByDay([
      tx({ amount: 100, date: "2026-07-10T09:00:00" }),
      tx({ amount: 200, date: "2026-07-10T20:00:00" }),
      tx({ amount: 300, date: "2026-07-09T09:00:00" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].total).toBe(300);
  });

  it("computes budget progress", () => {
    const p = budgetProgress(400000, 248000);
    expect(p.pct).toBe(62);
    expect(p.remaining).toBe(152000);
    expect(p.over).toBe(false);
  });
});

describe("calc — subscriptions", () => {
  it("sums the monthly-equivalent cost of active + trial", () => {
    const subs = [
      sub({ amount: 1000, frequency: "monthly" }),
      sub({ amount: 12000, frequency: "yearly" }),
      sub({ amount: 9999, status: "canceled" }),
    ];
    expect(subscriptionsMonthlyTotal(subs)).toBe(2000);
  });

  it("flags a price increase", () => {
    const insights = subscriptionInsights([sub({ amount: 2190, previousAmount: 1990 })], NOW);
    expect(insights.some((i) => i.kind === "price-increase")).toBe(true);
  });
});
