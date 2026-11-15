// @vitest-environment node
/**
 * Where bank entries land, and that the three copies of the list agree.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILY_CATEGORIES as APP } from "@/lib/family/categories";
import { categorize, FAMILY_CATEGORIES, type CategoryInput } from "./categories";

const out = (over: Partial<CategoryInput>): CategoryInput => ({ direction: "expense", ...over });

describe("the category list", () => {
  it("is the same on the server, in the app and in the database", () => {
    const sql = readFileSync(join(__dirname, "../../prepared/0012_bank_connections.sql"), "utf8");
    const body = sql.match(/function public\.family_categories\(\)[\s\S]*?array\[([\s\S]*?)\]/)?.[1] ?? "";
    const inDb = [...body.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
    expect(inDb).toEqual([...FAMILY_CATEGORIES]);
    expect([...APP]).toEqual([...FAMILY_CATEGORIES]);
  });
});

describe("categorize", () => {
  it("never counts money between one's own accounts as spending or income", () => {
    expect(categorize(out({ category: "Same person transfer" }))).toBe("Internal");
    expect(categorize(out({ category: "Credit card payment" }))).toBe("Internal");
    expect(categorize(out({ description: "PAGAMENTO DE FATURA" }))).toBe("Internal");
    expect(categorize({ direction: "income", category: "Same person transfer" })).toBe("Internal");
    expect(categorize(out({ category: "Investments" }))).toBe("Internal");
  });

  it("puts money in under Income", () => {
    expect(categorize({ direction: "income", category: "Salary" })).toBe("Income");
    expect(categorize({ direction: "income", description: "PIX RECEBIDO" })).toBe("Income");
  });

  it("finds betting by category, card code and operator, not inside other words", () => {
    expect(categorize(out({ category: "Gambling" }))).toBe("Betting & lotteries");
    expect(categorize(out({ mcc: 7995, merchantName: "PAGSEGURO*XYZ" }))).toBe("Betting & lotteries");
    expect(categorize(out({ merchantName: "BETANO" }))).toBe("Betting & lotteries");
    expect(categorize(out({ description: "PIX ENVIADO - Vai de Bet" }))).toBe("Betting & lotteries");
    expect(categorize(out({ description: "Lotérica Central" }))).toBe("Betting & lotteries");
    expect(categorize(out({ merchantName: "Alphabet Google Cloud", category: "Software" }))).toBe("Services");
    expect(categorize(out({ description: "Diabetes clinic", category: "Health" }))).toBe("Health");
  });

  it("uses the aggregator's category first", () => {
    expect(categorize(out({ category: "Food delivery", merchantName: "IFOOD" }))).toBe("Eating out");
    expect(categorize(out({ category: "Supermarkets" }))).toBe("Groceries");
    expect(categorize(out({ category: "Taxi and ride-hailing" }))).toBe("Transport");
    expect(categorize(out({ category: "Pharmacy" }))).toBe("Health");
    expect(categorize(out({ category: "Taxes" }))).toBe("Taxes");
    expect(categorize(out({ category: "Late payment and overdraft costs" }))).toBe("Loans & fees");
    expect(categorize(out({ category: "Coffee shops" }))).toBe("Eating out");
  });

  it("falls back to the merchant and the description", () => {
    expect(categorize(out({ merchantName: "UBER *TRIP" }))).toBe("Transport");
    expect(categorize(out({ merchantName: "99 TECNOLOGIA" }))).toBe("Transport");
    expect(categorize(out({ description: "Compra R$ 99,90 loja" }))).not.toBe("Transport");
    expect(categorize(out({ merchantName: "NETFLIX.COM" }))).toBe("Entertainment");
    expect(categorize(out({ merchantName: "Drogasil 123" }))).toBe("Health");
    expect(categorize(out({ description: "PIX ENVIADO Joao" }))).toBe("Transfers");
    expect(categorize(out({ description: "Pagamento IPVA 2026" }))).toBe("Taxes");
  });

  it("doesn't read everyday words as brands", () => {
    // "vivo", "claro" and "oi" are words before they are phone companies.
    expect(categorize(out({ description: "oi tudo claro, estou vivo" }))).toBe("Other");
  });

  it("always answers with one of the list", () => {
    const odd = [out({}), out({ category: "???", description: "\u0007" }), out({ mcc: 1234 })];
    for (const input of odd) expect(FAMILY_CATEGORIES).toContain(categorize(input));
  });
});
