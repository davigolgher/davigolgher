/**
 * The monthly report a guardian can save as a PDF (paid plan): the month's
 * total against the one before, spending by category, budgets and every
 * entry. Built as one HTML page that expo-print turns into a PDF on the phone;
 * nothing is sent anywhere to make it.
 *
 * Every piece of text that came from a bank (descriptions, merchants) is
 * escaped: a merchant name is data, never markup.
 */
import type { BankEntry } from "@/lib/backend/family";
import { budgetLines, byDay, formatMoney, summarize } from "./summary";
import type { FamilyCategory } from "./categories";
import { colors } from "./reportTheme";

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export interface ReportInput {
  dependentName: string;
  familyName: string;
  entries: BankEntry[];
  budgets: { category: FamilyCategory | "total"; limit: number }[];
  currency: string;
  now?: Date;
  generatedBy: string;
}

export function reportHtml(input: ReportInput): string {
  const now = input.now ?? new Date();
  const s = summarize(input.entries, now);
  const money = (c: number) => escapeHtml(formatMoney(c, input.currency));
  const month = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now);
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const inMonth = input.entries.filter((e) => {
    const t = new Date(e.date).getTime();
    return t >= start && t < end;
  });
  const change =
    s.change.direction === "flat" ? "the same as last month" : `${s.change.pct}% ${s.change.direction === "up" ? "more" : "less"} than last month`;
  const budgets = budgetLines(input.budgets, input.entries, now);

  const categoryRows = s.categories
    .map((c) => `<tr><td>${escapeHtml(c.category)}</td><td class="num">${money(c.total)}</td><td class="num">${c.pct}%</td></tr>`)
    .join("");
  const budgetRows = budgets
    .map(
      (b) =>
        `<tr><td>${escapeHtml(b.category === "total" ? "All spending" : b.category)}</td><td class="num">${money(b.spent)}</td><td class="num">${money(b.limit)}</td><td class="num${b.over ? " over" : ""}">${b.over ? "Over" : `${b.pct}%`}</td></tr>`,
    )
    .join("");
  const entryRows = byDay(inMonth)
    .flatMap((d) =>
      d.entries.map(
        (e) =>
          `<tr><td>${escapeHtml(d.day)}</td><td>${escapeHtml(e.merchant || e.description || "—")}</td><td>${escapeHtml(e.category)}</td><td class="num">${e.direction === "income" ? "+" : ""}${money(e.amount)}${e.status === "pending" ? " <span class=\"muted\">(pending)</span>" : ""}</td></tr>`,
      ),
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flow Family — ${escapeHtml(input.dependentName)} — ${escapeHtml(month)}</title>
<style>
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: ${colors.text}; margin: 32px; font-size: 12px; }
  h1 { font-size: 22px; margin: 0; }
  h2 { font-size: 14px; margin: 28px 0 8px; text-transform: uppercase; letter-spacing: 1px; color: ${colors.muted}; }
  .muted { color: ${colors.muted}; }
  .hero { font-size: 32px; font-weight: 700; margin: 16px 0 4px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 4px; border-bottom: 1px solid ${colors.line}; text-align: left; vertical-align: top; }
  th { color: ${colors.muted}; font-weight: 600; }
  .num { text-align: right; white-space: nowrap; }
  .over { color: ${colors.alert}; font-weight: 600; }
  footer { margin-top: 32px; color: ${colors.muted}; font-size: 10px; }
</style></head>
<body>
  <h1>${escapeHtml(input.dependentName)} — ${escapeHtml(month)}</h1>
  <div class="muted">${escapeHtml(input.familyName)} · Flow Family report</div>
  <div class="hero">${money(s.spent)}</div>
  <div class="muted">Spent this month, ${escapeHtml(change)} (${money(s.previous)}). ${s.count} entr${s.count === 1 ? "y" : "ies"}.</div>

  <h2>By category</h2>
  ${categoryRows ? `<table><tr><th>Category</th><th class="num">Spent</th><th class="num">Share</th></tr>${categoryRows}</table>` : `<p class="muted">No spending this month.</p>`}

  ${budgetRows ? `<h2>Budgets</h2><table><tr><th>Budget</th><th class="num">Spent</th><th class="num">Limit</th><th class="num">Used</th></tr>${budgetRows}</table>` : ""}

  <h2>Entries</h2>
  ${entryRows ? `<table><tr><th>Date</th><th>Where</th><th>Category</th><th class="num">Amount</th></tr>${entryRows}</table>` : `<p class="muted">No entries this month.</p>`}

  <footer>
    Generated on ${escapeHtml(new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(now))} by ${escapeHtml(input.generatedBy)}
    from accounts ${escapeHtml(input.dependentName)} chose to share through open banking. Transfers between their own accounts
    and card bill payments are listed as "Internal" and not counted. Contains personal financial information — keep it private.
  </footer>
</body></html>`;
}
