import { describe, expect, it } from "vitest";
import { accessFor, isStale, statusFor } from "./logic";

const NOW = Date.parse("2026-09-24T12:00:00Z");
const LATER = NOW + 30 * 86_400_000;

describe("RevenueCat webhook — access", () => {
  it("grants on purchase and renewal, trial included", () => {
    expect(accessFor({ type: "INITIAL_PURCHASE", expiration_at_ms: LATER }, NOW)).toEqual({ status: "active", willRenew: true });
    expect(accessFor({ type: "INITIAL_PURCHASE", period_type: "TRIAL", expiration_at_ms: LATER }, NOW).status).toBe("trialing");
    expect(accessFor({ type: "RENEWAL", expiration_at_ms: LATER }, NOW).status).toBe("active");
  });

  it("keeps access to the end of the period when auto-renew is switched off", () => {
    expect(accessFor({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", expiration_at_ms: LATER }, NOW)).toEqual({
      status: "active",
      willRenew: false,
    });
  });

  it("ends access at once on a refund", () => {
    expect(statusFor({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", expiration_at_ms: LATER })).toEqual({
      status: "inactive",
      willRenew: false,
    });
  });

  it("grants nothing for a period that has already ended", () => {
    // A late retry of an old renewal must not reopen access.
    expect(accessFor({ type: "RENEWAL", expiration_at_ms: NOW - 1000 }, NOW).status).toBe("inactive");
  });

  it("ends access on expiration and pause", () => {
    expect(accessFor({ type: "EXPIRATION" }, NOW).status).toBe("inactive");
    expect(accessFor({ type: "SUBSCRIPTION_PAUSED" }, NOW).status).toBe("inactive");
  });
});

describe("RevenueCat webhook — ordering", () => {
  it("ignores an event older than the one already applied", () => {
    expect(isStale({ event_timestamp_ms: NOW - 60_000 }, new Date(NOW).toISOString())).toBe(true);
    expect(isStale({ event_timestamp_ms: NOW + 60_000 }, new Date(NOW).toISOString())).toBe(false);
    expect(isStale({ event_timestamp_ms: NOW }, null)).toBe(false);
    expect(isStale({}, new Date(NOW).toISOString())).toBe(false);
  });
});
