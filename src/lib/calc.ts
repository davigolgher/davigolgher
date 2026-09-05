/**
 * Centralized calculations: period totals, grouping, comparisons, budget
 * progress, and subscription aggregates.
 */
import { Money, type Cents } from "./money";
import { startOfDay } from "./format";
import { monthlyEquivalent, annualEquivalent, daysUntil } from "./recurrence";
import type { Budget, CategoryId, Subscription, Transaction } from "@/data/types";

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function startOfWeek(d: Date): Date {
  const copy = startOfDay(d);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

const isExpense = (t: Transaction) => t.direction === "expense";

export function totalBetween(txs: Transaction[], start: Date, end: Date): Cents {
  const s = start.getTime();
  const e = end.getTime();
  return Money.sum(
    txs
      .filter(isExpense)
      .filter((t) => {
        const time = new Date(t.date).getTime();
        return time >= s && time <= e;
      })
      .map((t) => t.amount),
  );
}

export function totalToday(txs: Transaction[], now: Date = new Date()): Cents {
  return totalBetween(txs, startOfDay(now), new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
}

export function totalThisWeek(txs: Transaction[], now: Date = new Date()): Cents {
  return totalBetween(txs, startOfWeek(now), now);
}

export function totalThisMonth(txs: Transaction[], now: Date = new Date()): Cents {
  return totalBetween(txs, startOfMonth(now), endOfMonth(now));
}

export function totalPrevMonth(txs: Transaction[], now: Date = new Date()): Cents {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return totalBetween(txs, startOfMonth(prev), endOfMonth(prev));
}

export type Direction = "up" | "down" | "flat";
export interface Comparison {
  direction: Direction;
  pct: number;
}

export function compare(current: Cents, previous: Cents): Comparison {
  if (previous <= 0) return { direction: current > 0 ? "up" : "flat", pct: current > 0 ? 100 : 0 };
  const diff = current - previous;
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  if (pct === 0) return { direction: "flat", pct: 0 };
  return { direction: diff > 0 ? "up" : "down", pct };
}

export interface DayGroup {
  key: string;
  date: string;
  total: Cents;
  items: Transaction[];
}

export function groupByDay(txs: Transaction[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const t of [...txs].sort((a, b) => +new Date(b.date) - +new Date(a.date))) {
    const d = startOfDay(new Date(t.date));
    const key = d.toISOString().slice(0, 10);
    let group = map.get(key);
    if (!group) {
      group = { key, date: d.toISOString(), total: 0, items: [] };
      map.set(key, group);
    }
    group.items.push(t);
    if (isExpense(t)) group.total = Money.add(group.total, t.amount);
  }
  return [...map.values()];
}

export function sumByCategory(txs: Transaction[]): Map<CategoryId, Cents> {
  const map = new Map<CategoryId, Cents>();
  for (const t of txs) {
    if (!isExpense(t)) continue;
    map.set(t.categoryId, Money.add(map.get(t.categoryId) ?? 0, t.amount));
  }
  return map;
}

export interface BudgetProgress {
  limit: Cents;
  spent: Cents;
  remaining: Cents;
  pct: number;
  over: boolean;
}

export function budgetProgress(limit: Cents, spent: Cents): BudgetProgress {
  return {
    limit,
    spent,
    remaining: Money.clampMin(Money.subtract(limit, spent)),
    pct: Money.percent(spent, limit),
    over: spent > limit,
  };
}

const isBillable = (s: Subscription) => s.status === "active" || s.status === "trial";

export function subscriptionsMonthlyTotal(subs: Subscription[]): Cents {
  return Money.sum(subs.filter(isBillable).map((s) => monthlyEquivalent(s)));
}

export function subscriptionsAnnualTotal(subs: Subscription[]): Cents {
  return Money.sum(subs.filter(isBillable).map((s) => annualEquivalent(s)));
}

export function activeSubscriptions(subs: Subscription[]): Subscription[] {
  return subs.filter(isBillable);
}

export function upcomingCharges(subs: Subscription[]): Subscription[] {
  return activeSubscriptions(subs).slice().sort((a, b) => +new Date(a.nextChargeAt) - +new Date(b.nextChargeAt));
}

export function spentForBudget(budget: Budget, txs: Transaction[], subs: Subscription[], now: Date = new Date()): Cents {
  if (budget.scope === "total") return totalThisMonth(txs, now);
  if (budget.scope === "subscriptions") return subscriptionsMonthlyTotal(subs);
  const monthTxs = txs.filter((t) => {
    const d = new Date(t.date);
    return d >= startOfMonth(now) && d <= endOfMonth(now) && isExpense(t) && t.categoryId === budget.scope;
  });
  return Money.sum(monthTxs.map((t) => t.amount));
}

export interface SubscriptionInsight {
  id: string;
  kind: "renewal" | "price-increase" | "trial-ending" | "unused";
  subscription: Subscription;
  message: string;
}

/** Descriptive signals (never automatic decisions). */
export function subscriptionInsights(subs: Subscription[], now: Date = new Date()): SubscriptionInsight[] {
  const out: SubscriptionInsight[] = [];
  for (const s of subs) {
    if (s.status === "canceled" || s.status === "archived") continue;
    if (s.trialEndsAt) {
      const d = daysUntil(s.trialEndsAt, now);
      if (d >= 0 && d <= 5)
        out.push({ id: `trial-${s.id}`, kind: "trial-ending", subscription: s, message: `The free trial ends ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}.` });
    }
    if (s.previousAmount && s.amount > s.previousAmount)
      out.push({ id: `price-${s.id}`, kind: "price-increase", subscription: s, message: "The price of this subscription went up." });
    const renewIn = daysUntil(s.nextChargeAt, now);
    if (isBillable(s) && renewIn >= 0 && renewIn <= 3)
      out.push({ id: `renew-${s.id}`, kind: "renewal", subscription: s, message: `Renews ${renewIn === 0 ? "today" : `in ${renewIn} day${renewIn === 1 ? "" : "s"}`}.` });
    if (s.lastUsedAt) {
      const idle = -daysUntil(s.lastUsedAt, now);
      if (isBillable(s) && idle >= 45)
        out.push({ id: `unused-${s.id}`, kind: "unused", subscription: s, message: "No recent usage recorded for this subscription." });
    }
  }
  return out;
}
