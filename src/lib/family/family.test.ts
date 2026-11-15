/**
 * The guardian's numbers, the report and the words — the logic under the
 * Flow Family screens, without a phone.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { BankEntry } from "@/lib/backend/family";
import { budgetLines, byDay, counted, currenciesOf, currencySymbol, formatMoney, loadWindow, mainCurrency, summarize } from "./summary";
import { ANOTHER_COUNTRY, countryOptions, orderForRegion } from "./countries";
import { escapeHtml, reportHtml } from "./report";
import { colors as reportColors } from "./reportTheme";
import { describeActivity, describeAlert } from "./copy";
import { BUDGET_CATEGORIES, FAMILY_CATEGORIES } from "./categories";

const NOW = new Date(2026, 10, 15, 12); // 15 Nov 2026, local time
let seq = 0;
const e = (over: Partial<BankEntry> = {}): BankEntry => ({
  id: `e${++seq}`,
  account_id: "acc",
  amount: 1000,
  direction: "expense",
  description: "Padaria",
  merchant: null,
  category: "Eating out",
  date: new Date(2026, 10, 10, 9).toISOString(),
  status: "posted",
  currency: "BRL",
  ...over,
});

describe("summarize", () => {
  it("counts this month's spending against last month's, leaving out money between one's own accounts", () => {
    const entries = [
      e({ amount: 5000 }),
      e({ amount: 2000, status: "pending", category: "Transport" }),
      e({ amount: 90000, category: "Internal" }),
      e({ amount: 300000, direction: "income", category: "Income" }),
      e({ amount: 3500, date: new Date(2026, 9, 20).toISOString() }),
    ];
    const s = summarize(entries, NOW);
    expect(s.spent).toBe(7000);
    expect(s.previous).toBe(3500);
    expect(s.change).toEqual({ direction: "up", pct: 100 });
    expect(s.income).toBe(300000);
    expect(s.categories.map((c) => [c.category, c.total, c.pct])).toEqual([
      ["Eating out", 5000, 71],
      ["Transport", 2000, 29],
    ]);
    expect(s.months).toHaveLength(6);
    expect(s.months.at(-1)?.total).toBe(7000);
    expect(s.count).toBe(3);
    expect(counted(entries)).toHaveLength(4);
  });

  it("an empty month is zero, not an error", () => {
    const s = summarize([], NOW);
    expect(s).toMatchObject({ spent: 0, previous: 0, change: { direction: "flat", pct: 0 }, categories: [], count: 0 });
  });
});

describe("budgets", () => {
  it("each budget against its category this month; the total first, then the fullest", () => {
    const entries = [e({ amount: 6000 }), e({ amount: 1000, category: "Transport" }), e({ amount: 999999, category: "Internal" })];
    const lines = budgetLines(
      [
        { category: "Transport", limit: 5000 },
        { category: "Eating out", limit: 5000 },
        { category: "total", limit: 10000 },
      ],
      entries,
      NOW,
    );
    expect(lines.map((l) => [l.category, l.spent, l.over])).toEqual([
      ["total", 7000, false],
      ["Eating out", 6000, true],
      ["Transport", 1000, false],
    ]);
  });

  it("can be set for every category but income and internal moves", () => {
    expect(BUDGET_CATEGORIES).not.toContain("Income");
    expect(BUDGET_CATEGORIES).not.toContain("Internal");
    expect(BUDGET_CATEGORIES).toHaveLength(FAMILY_CATEGORIES.length - 2);
  });
});

describe("helpers", () => {
  it("formats in the bank's currency, the way Flow does", () => {
    expect(formatMoney(2590, "BRL").replace(/\s/g, " ")).toBe("R$ 25,90");
    expect(formatMoney(2590, "USD")).toBe("$25.90");
    expect(formatMoney(2590, "CHF")).toContain("25.90");
  });

  it("loads six months, groups the feed by day, finds the main currency", () => {
    const w = loadWindow(NOW);
    expect(w.from.getMonth()).toBe(5);
    expect(w.from.getDate()).toBe(1);
    const days = byDay([e({ date: new Date(2026, 10, 1, 8).toISOString() }), e({ date: new Date(2026, 10, 2, 8).toISOString() }), e({ date: new Date(2026, 10, 2, 20).toISOString() })]);
    expect(days.map((d) => [d.day, d.entries.length])).toEqual([
      ["2026-11-02", 2],
      ["2026-11-01", 1],
    ]);
    expect(mainCurrency([e(), e(), e({ currency: "USD" })])).toBe("BRL");
    expect(mainCurrency([])).toBe("BRL");
  });
});

describe("report", () => {
  it("escapes everything that came from a bank", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;");
    const html = reportHtml({
      dependentName: "Ana <b>",
      familyName: "The Silvas",
      entries: [e({ merchant: "<script>steal()</script>", amount: 4590 })],
      budgets: [{ category: "Eating out", limit: 1000 }],
      currency: "BRL",
      now: NOW,
      generatedBy: "Maria",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;steal()&lt;/script&gt;");
    expect(html).toContain("Ana &lt;b&gt;");
    expect(html).toContain("November 2026");
    expect(html).toContain('class="num over"');
  });

  it("uses the design tokens' colours", () => {
    const require = createRequire(import.meta.url);
    const tokens = require("../../../mobile/src/theme/tokens.js");
    expect(reportColors).toEqual({
      text: tokens.colors.chalk.DEFAULT,
      muted: tokens.colors.chalk.mute,
      line: tokens.colors.line.DEFAULT,
      alert: tokens.colors.signal.alert,
    });
  });
});

describe("words", () => {
  it("never puts an amount in an alert without the purchase to back it", () => {
    expect(describeAlert("large_purchase", "Ana", { threshold: 10000 })).toBe("Ana made a purchase above your limit.");
    expect(describeAlert("large_purchase", "Ana", {}, { amount: 45990, currency: "BRL", merchant: "Loja", description: "" }).replace(/\s/g, " ")).toBe(
      "Ana spent R$ 459,90 at Loja.",
    );
    expect(describeAlert("budget_exceeded", "Ana", { category: "total" })).toBe("Ana passed the monthly budget.");
    expect(describeAlert("budget_exceeded", "Ana", { category: "Eating out" })).toBe("Ana passed the Eating out budget.");
  });

  it("tells the dependent who looked", () => {
    expect(describeActivity("viewed_transactions", "Maria", false)).toBe("Maria viewed your spending");
    expect(describeActivity("viewed_transactions", "Maria", true)).toBe("You viewed their spending");
    expect(describeActivity("something_new", null, false)).toBe("Someone: something new");
  });
});

describe("countries and currencies", () => {
  it("offers the countries the switched-on providers cover, the phone's first", () => {
    const all = countryOptions({ pluggy: true, plaid: true, saltedge: true });
    expect(all.find((o) => o.code === "BR")?.provider).toBe("pluggy");
    expect(all.find((o) => o.code === "US")?.provider).toBe("plaid");
    expect(all.at(-1)?.code).toBe(ANOTHER_COUNTRY);
    expect(orderForRegion(all, "de")[0].code).toBe("DE");
    // A country not on the list: "Another country" leads.
    expect(orderForRegion(all, "JP")[0].code).toBe(ANOTHER_COUNTRY);

    const saltEdgeOnly = countryOptions({ pluggy: false, plaid: false, saltedge: true });
    expect(saltEdgeOnly.every((o) => o.provider === "saltedge")).toBe(true);
    expect(countryOptions({ pluggy: true, plaid: false, saltedge: false }).map((o) => o.code)).toEqual(["BR"]);
    expect(countryOptions({ pluggy: false, plaid: false, saltedge: false })).toEqual([]);
  });

  it("names currencies the way Flow shows them, and lists the ones in use", () => {
    expect(currencySymbol("BRL")).toBe("R$");
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("GBP")).toBe("£");
    expect(currenciesOf([e({ currency: "USD" }), e({ currency: "EUR" }), e({ currency: "USD" })])).toEqual(["USD", "EUR"]);
  });
});
