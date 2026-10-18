import { describe, it, expect } from "vitest";
import { Money, toCents, toMain, digitsToCents } from "./money";

describe("money — safe integer cents", () => {
  it("converts main units to cents and back", () => {
    expect(toCents(12.5)).toBe(1250);
    expect(toCents(0.1)).toBe(10);
    expect(toMain(1250)).toBe(12.5);
  });

  it("parses digit strings as cents", () => {
    expect(digitsToCents("1250")).toBe(1250);
    expect(digitsToCents("$12.50")).toBe(1250);
    expect(digitsToCents("")).toBe(0);
    expect(digitsToCents("abc")).toBe(0);
  });

  it("adds and subtracts as integers", () => {
    expect(Money.add(100, 200, 50)).toBe(350);
    expect(Money.subtract(500, 200)).toBe(300);
    expect(Money.sum([100, 200, 300])).toBe(600);
  });

  it("computes percentage safely", () => {
    expect(Money.percent(248000, 400000)).toBe(62);
    expect(Money.percent(100, 0)).toBe(0);
  });

  it("scales and floors", () => {
    expect(Money.scale(1000, 0.5)).toBe(500);
    expect(Money.scale(1000, 1 / 3)).toBe(333);
    expect(Money.clampMin(-50)).toBe(0);
    expect(Money.clampMin(120)).toBe(120);
  });
});
