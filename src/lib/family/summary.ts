/**
 * The guardian's dashboard, as numbers: what a dependent spent, where, against
 * the month before and against the budgets set for them.
 *
 * Built on the same helpers as Flow's own Home and Reports (src/lib/calc.ts,
 * src/lib/reports.ts), so "spent this month" means the same thing in both. Two
 * rules are particular to bank entries:
 *   · "Internal" (between one's own accounts, card bills, investments) is
 *     shown in the feed and never counted: a card bill counted as spending
 *     would count every purchase on the card twice.
 *   · Pending entries count. A purchase waiting to post is money already
 *     committed; leaving it out makes today's spending look smaller than it is.
 */
import type { Transaction } from "@/data/types";
import type { BankEntry } from "@/lib/backend/family";
import { budgetProgress, compare, endOfMonth, startOfMonth, totalBetween, type BudgetProgress, type Comparison } from "@/lib/calc";
import { categoryBreakdown, monthlyTotals, type CategorySlice, type MonthTotal } from "@/lib/reports";
import { currencyByCode } from "@/data/currencies";
import { formatCurrency } from "@/lib/format";
import type { Cents } from "@/lib/money";
import { isInternal, type FamilyCategory } from "./categories";

/** A bank entry in the shape Flow's calculations take. */
export function toTransaction(e: BankEntry): Transaction {
  return {
    id: e.id,
    amount: e.amount,
    direction: e.direction,
    description: e.description,
    categoryId: e.category,
    date: e.date,
    merchant: e.merchant ?? undefined,
    currency: e.currency,
  };
}

/** Entries that count as spending or income: everything but money moved between one's own accounts. */
export const counted = (entries: BankEntry[]) => entries.filter((e) => !isInternal(e.category)).map(toTransaction);

export interface PeriodSummary {
  spent: Cents;
  previous: Cents;
  change: Comparison;
  income: Cents;
  categories: CategorySlice[];
  months: MonthTotal[];
  count: number;
}

/** This month (the month `now` falls in) against the one before. */
export function summarize(entries: BankEntry[], now: Date = new Date(), locale = "en-US"): PeriodSummary {
  const txs = counted(entries);
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const spent = totalBetween(txs, start, end);
  const previous = totalBetween(txs, startOfMonth(prev), endOfMonth(prev));
  const income = txs
    .filter((t) => t.direction === "income")
    .filter((t) => {
      const time = new Date(t.date).getTime();
      return time >= start.getTime() && time <= end.getTime();
    })
    .reduce((sum, t) => sum + t.amount, 0);
  return {
    spent,
    previous,
    change: compare(spent, previous),
    income,
    categories: categoryBreakdown(txs, now),
    months: monthlyTotals(txs, locale, 6, now),
    count: txs.filter((t) => {
      const time = new Date(t.date).getTime();
      return time >= start.getTime() && time <= end.getTime();
    }).length,
  };
}

export interface BudgetLine extends BudgetProgress {
  category: FamilyCategory | "total";
}

/** Each budget against this month's spending in its category ("total": all of it). */
export function budgetLines(budgets: { category: FamilyCategory | "total"; limit: Cents }[], entries: BankEntry[], now: Date = new Date()): BudgetLine[] {
  const txs = counted(entries).filter((t) => t.direction === "expense");
  const start = startOfMonth(now);
  const end = endOfMonth(now);
  return budgets
    .map((b) => {
      const scoped = b.category === "total" ? txs : txs.filter((t) => t.categoryId === b.category);
      return { category: b.category, ...budgetProgress(b.limit, totalBetween(scoped, start, end)) };
    })
    .sort((a, b) => (a.category === "total" ? -1 : b.category === "total" ? 1 : b.pct - a.pct));
}

/** The window the dashboard loads: from the first day of the month six months back. */
export function loadWindow(now: Date = new Date()): { from: Date; to: Date } {
  return { from: new Date(now.getFullYear(), now.getMonth() - 5, 1), to: endOfMonth(now) };
}

/** Money as Flow shows it, in the currency the bank reported. */
export function formatMoney(cents: Cents, currency: string, opts: { signDisplay?: "auto" | "always" | "never" | "exceptZero" } = {}): string {
  const known = currencyByCode(currency);
  const locale = known.code === currency ? known.locale : "en-US";
  try {
    return formatCurrency(cents, { locale, currency, ...opts });
  } catch {
    return formatCurrency(cents, { locale: "en-US", currency: "USD", ...opts });
  }
}

/** The most common currency among the entries (a dependent's banks are almost always one currency). */
export function mainCurrency(entries: BankEntry[], fallback = "BRL"): string {
  const count = new Map<string, number>();
  for (const e of entries) count.set(e.currency, (count.get(e.currency) ?? 0) + 1);
  let best = fallback;
  let n = 0;
  for (const [c, k] of count) if (k > n) [best, n] = [c, k];
  return best;
}

/** Entries grouped by calendar day, newest first, for the feed. */
export function byDay(entries: BankEntry[]): { day: string; entries: BankEntry[] }[] {
  const sorted = [...entries].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const out: { day: string; entries: BankEntry[] }[] = [];
  for (const e of sorted) {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const last = out[out.length - 1];
    if (last?.day === key) last.entries.push(e);
    else out.push({ day: key, entries: [e] });
  }
  return out;
}
