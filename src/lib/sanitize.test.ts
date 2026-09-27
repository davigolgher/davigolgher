import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeMultiline, safeHttpUrl } from "./sanitize";

const ZWSP = String.fromCharCode(0x200b);
const RLO = String.fromCharCode(0x202e);
const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

describe("sanitizeText", () => {
  it("strips control, zero-width and bidi chars", () => {
    expect(sanitizeText(`a${NUL}b${ZWSP}c${RLO}d`)).toBe("abcd");
  });
  it("collapses whitespace and trims", () => {
    expect(sanitizeText(`  hello${TAB}${TAB} world  `)).toBe("hello world");
  });
  it("caps length", () => {
    expect(sanitizeText("x".repeat(500), 10)).toHaveLength(10);
  });
  it("handles non-strings", () => {
    expect(sanitizeText(undefined)).toBe("");
    expect(sanitizeText(42 as unknown)).toBe("");
  });
});

describe("sanitizeMultiline", () => {
  it("keeps single newlines but caps blank runs", () => {
    const input = "a\n\n\n\nb";
    expect(sanitizeMultiline(input)).toBe("a\n\nb");
  });
});

describe("safeHttpUrl", () => {
  it("allows https and http", () => {
    expect(safeHttpUrl("https://buy.stripe.com/x")).toBe("https://buy.stripe.com/x");
  });
  it("rejects javascript and data URLs", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
  });
});
