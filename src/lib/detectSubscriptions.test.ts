import { describe, expect, it } from "vitest";
import type { Subscription, Transaction } from "@/data/types";
import { candidateToSubscription, detectSubscriptions, merchantKey } from "./detectSubscriptions";

const NOW = new Date("2026-11-16T12:00:00Z");
let seq = 0;
const tx = (daysAgo: number, merchant: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  amount,
  direction: "expense",
  description: merchant.toUpperCase(),
  merchant,
  categoryId: "Entertainment",
  date: new Date(+NOW - daysAgo * 86_400_000).toISOString(),
  currency: "BRL",
  ...over,
});

describe("merchantKey", () => {
  it("sees the same merchant through card-statement noise", () => {
    expect(merchantKey({ description: "NETFLIX.COM 0423 SAO PAULO" })).toBe(merchantKey({ merchant: "Netflix.com" }));
    expect(merchantKey({ description: "PAG*Spotify 12/34" })).toBe("spotify");
  });
});

describe("detectSubscriptions", () => {
  it("finds a monthly plan from three charges, with the next charge and the monthly cost", () => {
    const [c] = detectSubscriptions([tx(62, "Netflix", 3990), tx(31, "Netflix", 3990), tx(1, "Netflix", 3990)], [], new Set(), NOW);
    expect(c).toMatchObject({ name: "Netflix", amount: 3990, frequency: "monthly", occurrences: 3, monthly: 3990, currency: "BRL" });
    expect(new Date(c.nextChargeAt).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("accepts a price rise, not a supermarket's different total every visit", () => {
    const rise = detectSubscriptions([tx(61, "Spotify", 2190), tx(30, "Spotify", 2390)], [], new Set(), NOW);
    expect(rise.map((c) => c.amount)).toEqual([2390]);
    const groceries = detectSubscriptions(
      [tx(60, "Supermercado Central", 18740), tx(30, "Supermercado Central", 9630), tx(1, "Supermercado Central", 25410)],
      [],
      new Set(),
      NOW,
    );
    expect(groceries).toEqual([]);
  });

  it("ignores irregular rhythms, one-off purchases, income and transfers", () => {
    expect(detectSubscriptions([tx(50, "Cinema", 4400), tx(9, "Cinema", 4400)], [], new Set(), NOW)).toEqual([]);
    expect(detectSubscriptions([tx(3, "Loja", 9900)], [], new Set(), NOW)).toEqual([]);
    const pix = [tx(60, "Pix para Ana", 4000, { categoryId: "Transfers" }), tx(30, "Pix para Ana", 4000, { categoryId: "Transfers" })];
    expect(detectSubscriptions(pix, [], new Set(), NOW)).toEqual([]);
    const salary = [tx(60, "Empresa", 450000, { direction: "income" }), tx(30, "Empresa", 450000, { direction: "income" })];
    expect(detectSubscriptions(salary, [], new Set(), NOW)).toEqual([]);
  });

  it("needs a longer run for weekly plans, and drops plans that stopped charging", () => {
    expect(detectSubscriptions([tx(14, "Gym", 3000), tx(7, "Gym", 3000)], [], new Set(), NOW)).toEqual([]);
    const weekly = detectSubscriptions([tx(21, "Gym", 3000), tx(14, "Gym", 3000), tx(7, "Gym", 3000), tx(0, "Gym", 3000)], [], new Set(), NOW);
    expect(weekly[0]).toMatchObject({ frequency: "weekly", monthly: 13000 });
    expect(detectSubscriptions([tx(150, "Old plan", 1990), tx(120, "Old plan", 1990), tx(90, "Old plan", 1990)], [], new Set(), NOW)).toEqual([]);
  });

  it("leaves out what is already tracked or was dismissed, and sorts by monthly cost", () => {
    const txs = [tx(60, "Netflix", 3990), tx(30, "Netflix", 3990), tx(59, "iCloud", 1490), tx(29, "iCloud", 1490), tx(58, "Gympass", 9990), tx(28, "Gympass", 9990)];
    const tracked = [{ name: "NETFLIX", status: "active" } as Subscription];
    const found = detectSubscriptions(txs, tracked, new Set(["icloud"]), NOW);
    expect(found.map((c) => c.name)).toEqual(["Gympass"]);
    expect(detectSubscriptions(txs, [], new Set(), NOW).map((c) => c.name)).toEqual(["Gympass", "Netflix", "iCloud"]);
  });

  it("turns a candidate into a subscription to add, with reminders off until asked", () => {
    const [c] = detectSubscriptions([tx(60, "Netflix", 3990), tx(30, "Netflix", 3990)], [], new Set(), NOW);
    expect(candidateToSubscription(c)).toMatchObject({ name: "Netflix", amount: 3990, frequency: "monthly", status: "active", reminders: false });
  });
});
