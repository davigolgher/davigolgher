/**
 * What a RevenueCat event means for access — pure, so it can be tested
 * without Deno, a database or RevenueCat. index.ts does the I/O around it.
 */

export interface RcEvent {
  type?: string;
  app_user_id?: string;
  product_id?: string;
  period_type?: string; // NORMAL | TRIAL | INTRO
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  /** On CANCELLATION: CUSTOMER_SUPPORT means Apple refunded it. */
  cancel_reason?: string | null;
  store?: string;
}

export interface Access {
  status: "active" | "trialing" | "past_due" | "inactive";
  willRenew: boolean | null;
}

/** What the event says, before checking it against the clock. */
export function statusFor(event: RcEvent): Access {
  const trial = event.period_type === "TRIAL";
  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "TRANSFER":
      return { status: trial ? "trialing" : "active", willRenew: true };

    case "CANCELLATION":
      // A refund ends access now. Anything else is auto-renew being switched
      // off: access continues to the end of the paid period.
      if (event.cancel_reason === "CUSTOMER_SUPPORT") return { status: "inactive", willRenew: false };
      return { status: trial ? "trialing" : "active", willRenew: false };

    // Apple couldn't charge. Access stays in its grace period; the status marks
    // it so the app can nudge rather than lock the user out mid-period.
    case "BILLING_ISSUE":
      return { status: "past_due", willRenew: true };

    case "EXPIRATION":
    case "SUBSCRIPTION_PAUSED":
      return { status: "inactive", willRenew: false };

    default:
      return { status: "inactive", willRenew: null };
  }
}

/**
 * The event's meaning, checked against the clock: a period that has already
 * ended grants nothing, whatever the event type. That covers a late retry of
 * an old RENEWAL as well as a refund reported with an expiry of "now".
 */
export function accessFor(event: RcEvent, now: number = Date.now()): Access {
  const access = statusFor(event);
  if (access.status !== "inactive" && event.expiration_at_ms != null && event.expiration_at_ms <= now) {
    return { status: "inactive", willRenew: false };
  }
  return access;
}

/**
 * RevenueCat retries failed deliveries and doesn't promise order, so an old
 * event can arrive after a newer one. Anything older than what the row already
 * reflects is ignored rather than allowed to roll the state back.
 */
export function isStale(event: RcEvent, lastAppliedIso: string | null | undefined): boolean {
  if (!lastAppliedIso || event.event_timestamp_ms == null) return false;
  const last = Date.parse(lastAppliedIso);
  return Number.isFinite(last) && event.event_timestamp_ms < last;
}
