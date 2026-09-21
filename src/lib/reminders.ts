/**
 * Renewal reminders: which notifications to schedule, and when.
 *
 * Planning is separated from scheduling so the hard part — which subscriptions
 * qualify, what the cutoff is, what happens at a month boundary — can be tested
 * without a device. The native side's only job is to hand this list to the OS.
 *
 * Two kinds of reminder come out of here: the subscriptions the user tracks
 * (Netflix, the gym) and Flow's own renewal. The second is the one that matters
 * legally — charging without warning is the complaint behind most "I didn't
 * know I was still subscribed" disputes.
 */
import type { Subscription } from "@/data/types";
import type { BillingRow } from "./backend/billing";
import type { Cents } from "./money";
import { startOfDay } from "./format";
import { APP } from "@/config/app";

/** How many days before a charge the reminder fires. */
export const LEAD_DAY_CHOICES = [1, 2, 3, 7] as const;
export const DEFAULT_LEAD_DAYS = 2;

/** Local hour it fires. Morning, so there's a working day left to act in. */
const FIRE_HOUR = 9;

/**
 * iOS holds at most 64 pending local notifications per app and silently drops
 * anything past that, so stay under it and let the nearest charges win.
 */
const MAX_PENDING = 60;

export interface ReminderPlan {
  /** Stable for a subscription and charge date, so re-planning is idempotent. */
  key: string;
  title: string;
  body: string;
  fireAt: Date;
}

export interface PlanInput {
  subscriptions: Subscription[];
  /** Flow's own entitlement. Omitted or inactive means no reminder for it. */
  billing?: BillingRow | null;
  leadDays: number;
  now?: Date;
  /** Injected, so this module needs to know nothing about the user's currency. */
  formatAmount: (cents: Cents) => string;
  max?: number;
}

function inDays(n: number): string {
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

/** `lead` days before `chargeIso`, at FIRE_HOUR local. Null if that's past. */
function fireTime(chargeIso: string, lead: number, now: Date): Date | null {
  const charge = new Date(chargeIso);
  if (Number.isNaN(charge.getTime())) return null;
  const at = startOfDay(charge);
  at.setDate(at.getDate() - lead);
  at.setHours(FIRE_HOUR, 0, 0, 0);
  // A reminder for a charge that already happened is noise, not a reminder.
  return at.getTime() > now.getTime() ? at : null;
}

export function planReminders(input: PlanInput): ReminderPlan[] {
  const now = input.now ?? new Date();
  const lead = Math.max(0, Math.round(input.leadDays));
  const when = inDays(lead);
  const out: ReminderPlan[] = [];

  for (const s of input.subscriptions) {
    // Paused, cancelled and archived subscriptions are not going to charge.
    if (s.status !== "active" && s.status !== "trial") continue;
    if (!s.reminders) continue;

    const fireAt = fireTime(s.nextChargeAt, lead, now);
    if (!fireAt) continue;

    out.push({
      key: `sub:${s.id}:${startOfDay(new Date(s.nextChargeAt)).toISOString().slice(0, 10)}`,
      title: `${s.name} renews ${when}`,
      body: `${input.formatAmount(s.amount)} is due. Cancel with ${s.name} if you don't want it.`,
      fireAt,
    });
  }

  const own = planOwnRenewal(input.billing, lead, when, now);
  if (own) out.push(own);

  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, input.max ?? MAX_PENDING);
}

/**
 * Flow's own renewal.
 *
 * `will_renew` is false once auto-renew is switched off while access runs to
 * the end of the paid period. Warning someone about a charge that is not coming
 * is worse than saying nothing — so that case gets no reminder.
 */
function planOwnRenewal(
  billing: BillingRow | null | undefined,
  lead: number,
  when: string,
  now: Date,
): ReminderPlan | null {
  if (!billing) return null;
  if (billing.status !== "active" && billing.status !== "trialing") return null;
  if (billing.will_renew === false) return null;

  const end = billing.trial_end && billing.status === "trialing" ? billing.trial_end : billing.current_period_end;
  if (!end) return null;

  const fireAt = fireTime(end, lead, now);
  if (!fireAt) return null;

  const trial = billing.status === "trialing";
  return {
    key: `own:${startOfDay(new Date(end)).toISOString().slice(0, 10)}`,
    title: trial ? `Your ${APP.name} trial ends ${when}` : `${APP.name} renews ${when}`,
    body: trial
      ? "You'll be charged unless you cancel in the App Store first."
      : "Manage or cancel it in the App Store, under your Apple ID.",
    fireAt,
  };
}
