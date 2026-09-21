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
  const rows = [...map.entries()]
    .map(([category, value]) => ({ category, total: value }))
    .sort((a, b) => b.total - a.total);
  return withPercentages(rows, total);
}

/**
 * Percentages that add up to 100.
 *
 * Rounding each share on its own doesn't: an even split lands on 63% and 38%,
 * which reads as sloppy in the legend and draws the ring 1% too long — enough
 * overflow to swallow the gap where the last slice meets the first. So floor
 * every share and hand the leftover points to the largest remainders. On a tie
 * the bigger category gets the point, since the rows are already sorted.
 */
function withPercentages(rows: { category: string; total: Cents }[], total: Cents): CategorySlice[] {
  if (total <= 0) return rows.map((r) => ({ ...r, pct: 0 }));

  const exact = rows.map((r) => (r.total / total) * 100);
  const pcts = exact.map((v) => Math.floor(v));
  let left = 100 - pcts.reduce((a, b) => a + b, 0);

  for (const { i } of exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    pcts[i] += 1;
    left -= 1;
  }

  return rows.map((r, i) => ({ ...r, pct: pcts[i] }));
}

export interface MonthTotal {
  key: string;
  label: string;
  total: Cents;
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Spending per month over a continuous window ending with the current month,
 * oldest first.
 *
 * Every month in the window is returned, including the empty ones. A trend
 * needs a complete axis: skipping quiet months would put January next to
 * September as though they were adjacent, and a single month of data would
 * plot as one unconnected point. Oldest first because time reads left to right.
 */
export function monthlyTotals(
  expenses: Transaction[],
  locale = "en-US",
  monthsBack = 6,
  now: Date = new Date(),
): MonthTotal[] {
  const map = new Map<string, Cents>();
  for (const t of expenses) {
    if (!isExpense(t)) continue;
    const key = monthKey(new Date(t.date));
    map.set(key, Money.add(map.get(key) ?? 0, t.amount));
  }

  const out: MonthTotal[] = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    out.push({
      key,
      // Month only: six labels with the year attached don't fit an axis.
      label: new Intl.DateTimeFormat(locale, { month: "short" }).format(d),
      total: map.get(key) ?? 0,
    });
  }
  return out;
}
