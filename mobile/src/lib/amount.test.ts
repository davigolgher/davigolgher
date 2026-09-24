import { describe, expect, it } from "vitest";
import { amountTextToCents, centsToAmountText, MAX_WHOLE_DIGITS, sanitizeAmountText } from "./amount";

describe("amount fields", () => {
  it("reads either decimal separator", () => {
    expect(amountTextToCents("12,34")).toBe(1234);
    expect(amountTextToCents("12.3")).toBe(1230);
    expect(amountTextToCents("0.29")).toBe(29);
  });

  it("keeps two decimals and one separator", () => {
    expect(sanitizeAmountText("1.005")).toBe("1.00");
    expect(sanitizeAmountText("1.2.3")).toBe("1.23");
    expect(sanitizeAmountText(",5")).toBe("5");
  });

  it("caps the whole part so the value stays exact and storable", () => {
    const text = sanitizeAmountText("99999999999999999999.99");
    expect(text).toBe("9".repeat(MAX_WHOLE_DIGITS) + ".99");
    const cents = amountTextToCents(text);
    expect(cents).toBe(999_999_999_999);
    expect(Number.isSafeInteger(cents)).toBe(true);
  });

  it("round-trips for editing", () => {
    expect(centsToAmountText(20000)).toBe("200");
    expect(centsToAmountText(1999)).toBe("19.99");
    expect(centsToAmountText(0)).toBe("");
  });
});
