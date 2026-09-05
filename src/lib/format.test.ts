import { describe, it, expect } from "vitest";
import { formatCurrency, formatTime, formatRelativeDay } from "./format";

const norm = (s: string) => s.replace(/\s/g, " ");

describe("format — currency and dates", () => {
  it("formats currency in the default locale (USD)", () => {
    expect(norm(formatCurrency(125000))).toBe("$1,250.00");
    expect(norm(formatCurrency(0))).toBe("$0.00");
    expect(norm(formatCurrency(2099))).toBe("$20.99");
  });

  it("supports other currencies/locales (configurable)", () => {
    expect(norm(formatCurrency(125000, { locale: "pt-BR", currency: "BRL" }))).toBe("R$ 1.250,00");
    expect(norm(formatCurrency(2099, { locale: "de-DE", currency: "EUR" }))).toBe("20,99 €");
  });

  it("uses 'h' for time in Portuguese, ':' elsewhere", () => {
    const d = new Date(2026, 6, 26, 14, 30).toISOString();
    expect(formatTime(d, "pt-BR")).toBe("14h30");
    expect(formatTime(d, "en-US")).toBe("14:30");
  });

  it("shows relative day labels", () => {
    expect(formatRelativeDay(new Date().toISOString())).toBe("Today");
  });
});
