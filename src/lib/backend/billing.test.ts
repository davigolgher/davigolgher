import { describe, expect, it } from "vitest";
import { isActive } from "./billing";

const NOW = Date.parse("2026-09-24T12:00:00Z");

describe("isActive", () => {
  it("grants access for an active or trialing period that hasn't ended", () => {
    expect(isActive({ status: "active", current_period_end: "2026-10-24T12:00:00Z" }, NOW)).toBe(true);
    expect(isActive({ status: "trialing", trial_end: "2026-09-30T12:00:00Z", current_period_end: "2026-09-30T12:00:00Z" }, NOW)).toBe(true);
  });

  it("stops granting once the period is over, even if the row still says active", () => {
    expect(isActive({ status: "active", current_period_end: "2026-09-20T12:00:00Z" }, NOW)).toBe(false);
    expect(isActive({ status: "trialing", trial_end: "2026-09-23T12:00:00Z" }, NOW)).toBe(false);
  });

  it("never grants for other states or no row", () => {
    expect(isActive({ status: "inactive", current_period_end: "2026-10-24T12:00:00Z" }, NOW)).toBe(false);
    expect(isActive({ status: "past_due" }, NOW)).toBe(false);
    expect(isActive(null, NOW)).toBe(false);
  });
});
