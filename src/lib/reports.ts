/**
 * Report helpers: category breakdown (with percentages) and monthly totals.
 */
import { Money, type Cents } from "./money";
import { startOfMonth, endOfMonth } from "./calc";
import type { Transaction } from "@/data/types";

const isExpense = (t: Transaction) => t.direction === "expense";

export interface CategorySlice {
  category: string;
  total: Cents;
  pct: number;
}

export function categoryBreakdown(expenses: Transaction[], now: Date = new Date()): CategorySlice[] {
  const s = startOfMonth(now).getTime();
  const e = endOfMonth(now).getTime();
  const map = new Map<string, Cents>();
  for (const t of expenses) {
    if (!isExpense(t)) continue;
    const time = new Date(t.date).getTime();
    if (time < s || time > e) continue;
    const key = t.categoryId || "Uncategorized";
    map.set(key, Money.add(map.get(key) ?? 0, t.amount));
  }
  const total = Money.sum([...map.values()]);
  return [...map.entries()]
    .map(([category, value]) => ({ category, total: value, pct: total > 0 ? Math.round((value / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}

export interface MonthTotal {
  key: string;
  label: string;
  total: Cents;
}

export function monthlyTotals(expenses: Transaction[], locale = "en-US", monthsBack = 6): MonthTotal[] {
  const map = new Map<string, Cents>();
  for (const t of expenses) {
    if (!isExpense(t)) continue;
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, Money.add(map.get(key) ?? 0, t.amount));
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, monthsBack)
    .map(([key, total]) => {
      const [y, m] = key.split("-").map(Number);
      const label = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(y, m - 1, 1));
      return { key, label, total };
    });
}
