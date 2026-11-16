/**
 * The pieces that decide what a person sees first: the next step for where
 * they are, the insights worth a card, and the sample data that stands in
 * for theirs before they have any.
 */
import { describe, expect, it } from "vitest";
import type { Subscription, Transaction } from "@/data/types";
import { createSampleData } from "@/data/sample";
import { biggest, insightsFor, pace, topCategory, upcoming } from "./insights";
import { nextStep, type Stage } from "./nextStep";
import { detectSubscriptions } from "./detectSubscriptions";

const NOW = new Date(2026, 10, 16, 15, 0);
const DAY = 86_400_000;
let seq = 0;
const tx = (date: Date, amount: number, category = "Groceries", over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  amount,
  direction: "expense",
  description: "x",
  categoryId: category,
  date: date.toISOString(),
  currency: "BRL",
  ...over,
});
const sub = (name: string, inDays: number, amount = 3990): Subscription => ({
  id: name,
  name,
  amount,
  currency: "BRL",
  frequency: "monthly",
  nextChargeAt: new Date(+NOW + inDays * DAY).toISOString(),
  status: "active",
  categoryId: "Entertainment",
  reminders: false,
});

const base: Stage = {
  recentExpenses: 0,
  hasBudget: false,
  activeSubscriptions: 0,
  foundSubscriptions: 0,
  banksEnabled: false,
  bankConnected: null,
  bankNeedsAttention: null,
  remindersOn: false,
};

describe("nextStep", () => {
  it("a brand-new account is offered its bank first when banks are on, typing otherwise", () => {
    expect(nextStep({ ...base, banksEnabled: true, bankConnected: false })).toMatchObject({ id: "connect_bank", href: "/banks", alt: { href: "/add-expense" } });
    expect(nextStep(base)).toMatchObject({ id: "first_expense", href: "/add-expense" });
    // While the connections load, don't flash the wrong suggestion.
    expect(nextStep({ ...base, banksEnabled: true, bankConnected: null })).toBeNull();
  });

  it("a bank that needs the person beats everything", () => {
    expect(nextStep({ ...base, recentExpenses: 40, bankNeedsAttention: "Banco X" })).toMatchObject({ id: "reconnect_bank", tone: "warn", title: "Reconnect Banco X" });
  });

  it("then: subscriptions found, a budget (unless they didn't want one), subscriptions, reminders, then nothing", () => {
    const active = { ...base, recentExpenses: 12 };
    expect(nextStep({ ...active, foundSubscriptions: 2, foundMonthly: "R$ 50" })?.id).toBe("review_found_subscriptions");
    expect(nextStep(active)?.id).toBe("set_budget");
    expect(nextStep({ ...active, goals: ["subscriptions"] })?.id).toBe("add_subscription");
    expect(nextStep({ ...active, hasBudget: true })?.id).toBe("add_subscription");
    expect(nextStep({ ...active, hasBudget: true, activeSubscriptions: 3 })?.id).toBe("turn_on_reminders");
    expect(nextStep({ ...active, hasBudget: true, activeSubscriptions: 3, remindersOn: true })).toBeNull();
  });
});

describe("insights", () => {
  const lastMonth = (day: number) => new Date(2026, 9, day, 12);
  const thisMonth = (day: number) => new Date(2026, 10, day, 12);

  it("pace compares month to date with the same days of last month, and waits for enough entries", () => {
    const txs = [
      tx(lastMonth(2), 10000), tx(lastMonth(10), 10000), tx(lastMonth(15), 10000), tx(lastMonth(25), 90000),
      tx(thisMonth(2), 5000), tx(thisMonth(9), 5000), tx(thisMonth(14), 5000),
    ];
    expect(pace(txs, NOW)).toMatchObject({ kind: "pace", amount: 15000, delta: -15000, title: "Spending less than last month" });
    expect(pace(txs.slice(4), NOW)).toBeNull();
  });

  it("names the category taking most of the month, with its share", () => {
    const txs = [tx(new Date(2026, 10, 2), 6000, "Eating out"), tx(new Date(2026, 10, 3), 3000, "Groceries"), tx(new Date(2026, 10, 4), 1000, "Transport")];
    expect(topCategory(txs, NOW)).toMatchObject({ detail: "Eating out", amount: 6000, count: 60 });
  });

  it("lists charges due in the next 7 days, and the week's biggest purchase", () => {
    expect(upcoming([sub("StreamBox", 2), sub("Gym", 20)], NOW)).toMatchObject({ title: "StreamBox charges this week", amount: 3990, count: 1 });
    expect(upcoming([sub("Gym", 20)], NOW)).toBeNull();
    const week = [tx(new Date(+NOW - DAY), 2000, "Shopping", { merchant: "Shoes" }), tx(new Date(+NOW - 2 * DAY), 9000, "Shopping", { merchant: "Jacket" })];
    expect(biggest(week, NOW)).toMatchObject({ amount: 9000, detail: "Jacket" });
  });

  it("never says anything about an empty account", () => {
    expect(insightsFor([], [], NOW)).toEqual([]);
  });
});

describe("sample data", () => {
  it("is labelled, current, and has something on every screen", () => {
    const s = createSampleData("BRL", NOW);
    expect(s.isSimulated).toBe(true);
    expect(s.preferences.currency).toBe("BRL");
    expect(s.transactions.every((t) => +new Date(t.date) <= +NOW && t.currency === "BRL")).toBe(true);
    expect(s.transactions.some((t) => new Date(t.date).getMonth() === NOW.getMonth())).toBe(true);
    expect(s.budgets[0].limit).toBeGreaterThan(0);
    expect(insightsFor(s.transactions, s.subscriptions, NOW).length).toBeGreaterThan(0);
  });

  it("includes monthly charges nobody tracked, for Flow to find", () => {
    const s = createSampleData("USD", NOW);
    const found = detectSubscriptions(s.transactions, s.subscriptions, new Set(), NOW).map((c) => c.name);
    expect(found).toEqual(expect.arrayContaining(["CloudDrive"]));
    expect(found).not.toContain("StreamBox");
  });
});
