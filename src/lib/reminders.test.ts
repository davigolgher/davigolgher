import { describe, it, expect } from "vitest";
import { planReminders, DEFAULT_LEAD_DAYS } from "./reminders";
import type { Subscription, SubscriptionStatus } from "@/data/types";

const NOW = new Date("2026-09-21T12:00:00");
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    id: "s1",
    name: "Netflix",
    amount: 1599,
    currency: "USD",
    frequency: "monthly",
    nextChargeAt: "2026-10-01T00:00:00",
    status: "active",
    categoryId: "Subscriptions",
    reminders: true,
    ...over,
  };
}

const plan = (subs: Subscription[], leadDays = DEFAULT_LEAD_DAYS, billing?: Parameters<typeof planReminders>[0]["billing"]) =>
  planReminders({ subscriptions: subs, billing, leadDays, now: NOW, formatAmount: money });

describe("reminders — tracked subscriptions", () => {
  it("fires the morning of the lead day, not at the charge", () => {
    const [r] = plan([sub()], 2);
    expect(r.fireAt.toISOString().slice(0, 10)).toBe("2026-09-29");
    expect(r.fireAt.getHours()).toBe(9);
    expect(r.title).toBe("Netflix renews in 2 days");
    expect(r.body).toContain("$15.99");
  });

  it("says tomorrow rather than 'in 1 days'", () => {
    expect(plan([sub()], 1)[0].title).toBe("Netflix renews tomorrow");
  });

  it("skips a subscription with reminders switched off", () => {
    expect(plan([sub({ reminders: false })])).toHaveLength(0);
  });

  it.each<SubscriptionStatus>(["paused", "canceled", "archived"])("skips a %s subscription", (status) => {
    // Nothing is going to charge, so a warning would be a lie.
    expect(plan([sub({ status })])).toHaveLength(0);
  });

  it("keeps trials, which are exactly the ones worth warning about", () => {
    expect(plan([sub({ status: "trial" })])).toHaveLength(1);
  });

  it("drops a reminder whose moment has already passed", () => {
    // Charge tomorrow, lead of 7 days: that reminder was due last week.
    expect(plan([sub({ nextChargeAt: "2026-09-22T00:00:00" })], 7)).toHaveLength(0);
  });

  it("still fires when the lead crosses into the previous month", () => {
    const [r] = plan([sub({ nextChargeAt: "2026-10-02T00:00:00" })], 7);
    expect(r.fireAt.toISOString().slice(0, 10)).toBe("2026-09-25");
  });

  it("ignores an unparseable charge date instead of throwing", () => {
    expect(plan([sub({ nextChargeAt: "not a date" })])).toHaveLength(0);
  });

  it("orders soonest first and caps the list", () => {
    // iOS keeps only 64 pending notifications and drops the rest silently, so
    // the nearest charges have to be the ones that survive.
    const many = Array.from({ length: 80 }, (_, i) =>
      sub({ id: `s${i}`, nextChargeAt: new Date(2026, 9, 2 + i).toISOString() }),
    );
    const out = planReminders({ subscriptions: many, leadDays: 1, now: NOW, formatAmount: money });
    expect(out).toHaveLength(60);
    expect(out[0].fireAt.getTime()).toBeLessThan(out[59].fireAt.getTime());
  });

  it("gives each subscription and charge date its own stable key", () => {
    const out = plan([sub({ id: "a" }), sub({ id: "b" })]);
    expect(new Set(out.map((r) => r.key)).size).toBe(2);
    expect(plan([sub({ id: "a" })])[0].key).toBe(plan([sub({ id: "a" })])[0].key);
  });
});

describe("reminders — Flow's own renewal", () => {
  const billing = { status: "active", current_period_end: "2026-10-01T00:00:00", will_renew: true };

  it("warns before the subscription renews", () => {
    const out = plan([], 2, billing);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Flow renews in 2 days");
    expect(out[0].body).toContain("App Store");
  });

  it("stays quiet once auto-renew is off", () => {
    // Access runs to the end of the period, but no charge is coming — a
    // reminder here would be a warning about something that will not happen.
    expect(plan([], 2, { ...billing, will_renew: false })).toHaveLength(0);
  });

  it("stays quiet when there is no subscription", () => {
    expect(plan([], 2, null)).toHaveLength(0);
    expect(plan([], 2, { status: "canceled", current_period_end: "2026-10-01T00:00:00" })).toHaveLength(0);
  });

  it("uses the trial end date, and says a charge is coming", () => {
    const [r] = plan([], 2, {
      status: "trialing",
      trial_end: "2026-09-30T00:00:00",
      current_period_end: "2026-10-30T00:00:00",
    });
    expect(r.fireAt.toISOString().slice(0, 10)).toBe("2026-09-28");
    expect(r.title).toBe("Your Flow trial ends in 2 days");
    expect(r.body).toContain("charged");
  });

  it("stays quiet when the row has no renewal date to warn about", () => {
    expect(plan([], 2, { status: "active", will_renew: true })).toHaveLength(0);
  });
});
