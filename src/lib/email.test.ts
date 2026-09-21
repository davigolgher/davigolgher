import { describe, it, expect } from "vitest";
import { isEmailShaped, normalizeEmail, suggestEmailFix } from "./email";

describe("email — shape", () => {
  it("accepts ordinary addresses, including multi-level domains", () => {
    for (const ok of ["a@b.co", "davi@gmail.com", "d.golgher+flow@yahoo.com.br", "  Davi@Gmail.com  "]) {
      expect(isEmailShaped(ok)).toBe(true);
    }
  });

  it("rejects the shapes that can't be an address", () => {
    for (const bad of ["", "davi", "davi@", "@gmail.com", "davi@gmail", "davi gmail.com", "davi@gmail..com", "a@b.c"]) {
      expect(isEmailShaped(bad)).toBe(false);
    }
  });

  it("normalizes to what the backend will store", () => {
    expect(normalizeEmail("  Davi@GMAIL.com ")).toBe("davi@gmail.com");
  });
});

describe("email — typo suggestions", () => {
  it("catches the slips that land nowhere", () => {
    expect(suggestEmailFix("davi@gmial.com")).toBe("davi@gmail.com");
    expect(suggestEmailFix("davi@gmail.con")).toBe("davi@gmail.com");
    expect(suggestEmailFix("davi@hotmial.com")).toBe("davi@hotmail.com");
    expect(suggestEmailFix("davi@iclod.com")).toBe("davi@icloud.com");
  });

  it("says nothing about an address that's already right", () => {
    expect(suggestEmailFix("davi@gmail.com")).toBeNull();
    expect(suggestEmailFix("davi@icloud.com")).toBeNull();
  });

  it("leaves real providers that merely look like a common one alone", () => {
    // Two edits from gmail.com, and entirely real. Correcting it would tell
    // someone their own working address is wrong.
    expect(suggestEmailFix("davi@mail.com")).toBeNull();
    expect(suggestEmailFix("davi@zoho.com")).toBeNull();
  });

  it("leaves company and unknown domains alone", () => {
    // Far from any common provider — an unfamiliar domain, not a typo.
    expect(suggestEmailFix("davi@anthropic.com")).toBeNull();
    expect(suggestEmailFix("contato@golgherbusiness.com.br")).toBeNull();
  });

  it("keeps the local part exactly as typed", () => {
    expect(suggestEmailFix("d.golgher+flow@gmial.com")).toBe("d.golgher+flow@gmail.com");
  });

  it("returns null rather than throwing on nonsense", () => {
    for (const junk of ["", "davi", "@gmail.com", "   "]) {
      expect(suggestEmailFix(junk)).toBeNull();
    }
  });
});
