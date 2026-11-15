/**
 * The words Flow Family uses for states and events, in one place so every
 * screen says the same thing — and the transparency screen says plainly what
 * each recorded action was.
 */
import type { AlertKind, ConnectionStatus, DependentKind } from "@/lib/backend/family";
import { formatMoney } from "./summary";

export const KIND_LABEL: Record<DependentKind, string> = {
  adult: "Adult",
  minor: "Under 18",
  ward: "Adult with a legal representative",
};

export const KIND_HINT: Record<DependentKind, string> = {
  adult: "An adult child or an older relative who agrees to share. They consent for themselves.",
  minor: "A child or teenager. You consent as their parent or legal guardian, and they confirm on their phone.",
  ward: "An adult under curatela (legal guardianship). You consent as their legal representative.",
};

export const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  active: "Connected",
  updating: "Updating",
  needs_attention: "Needs attention",
  expired: "Consent expired",
  error: "Not updating",
};

/** What the person (the dependent) can do about a connection's state. */
export const CONNECTION_HINT: Record<ConnectionStatus, string> = {
  active: "Purchases arrive within minutes of the bank reporting them.",
  updating: "The bank is sending the latest entries.",
  needs_attention: "The bank needs you to sign in again. Reconnect to keep sharing.",
  expired: "The consent you gave at the bank ended. Reconnect to keep sharing.",
  error: "The bank isn't answering. It usually recovers on its own; reconnect if it doesn't.",
};

export const ALERT_RULE_LABEL: Record<AlertKind, string> = {
  large_purchase: "Purchase above an amount",
  sensitive_category: "Sensitive categories",
  budget_exceeded: "Budget exceeded",
  connection_expired: "Bank connection stopped",
};

export const ALERT_RULE_HINT: Record<AlertKind, string> = {
  large_purchase: "Any single purchase at or above the amount you set.",
  sensitive_category: "Betting and lotteries by default, or the categories you choose.",
  budget_exceeded: "When a monthly budget is passed. Once per budget per month.",
  connection_expired: "When a shared bank connection stops updating. At most once a day.",
};

/**
 * One line for an alert in the inbox. The alert records only its rule
 * (0014); the purchase, when there is one and the guardian can still see it,
 * comes from the feed.
 */
export function describeAlert(
  kind: AlertKind,
  name: string,
  detail: Record<string, unknown>,
  entry?: { amount: number; currency: string; merchant: string | null; description: string } | null,
): string {
  const amount = entry ? formatMoney(entry.amount, entry.currency) : null;
  const where = entry ? entry.merchant || entry.description : "";
  switch (kind) {
    case "large_purchase":
      return amount ? `${name} spent ${amount}${where ? ` at ${where}` : ""}.` : `${name} made a purchase above your limit.`;
    case "sensitive_category":
      return `${name} had a purchase in ${String(detail.category ?? "a sensitive category")}${amount ? ` — ${amount}` : ""}.`;
    case "budget_exceeded":
      return detail.category === "total" || !detail.category
        ? `${name} passed the monthly budget.`
        : `${name} passed the ${String(detail.category)} budget.`;
    case "connection_expired":
      return `${name}'s bank connection stopped updating.`;
  }
}

/**
 * The access history, in plain words. `me` is the person reading it; the
 * entry was either done by them or about them.
 */
export function describeActivity(action: string, byName: string | null, byMe: boolean): string {
  const who = byMe ? "You" : (byName ?? "Someone");
  switch (action) {
    case "viewed_transactions":
      return byMe ? "You viewed their spending" : `${who} viewed your spending`;
    case "family_created":
      return `${who} created the family`;
    case "invite_created":
      return `${who} created an invitation`;
    case "invite_revoked":
      return `${who} cancelled an invitation`;
    case "invite_accepted":
    case "consent_granted":
      return byMe ? "You agreed to share" : `${who} agreed to share`;
    case "consent_renewed":
      return `${who} renewed the sharing`;
    case "consent_ended":
      return "Sharing ended";
    case "member_left":
      return `${who} left the family`;
    case "member_removed":
      return `${who} removed a member`;
    case "account_shared":
      return `${who} started sharing an account`;
    case "account_unshared":
      return `${who} stopped sharing an account`;
    case "bank_connected":
      return `${who} connected a bank`;
    case "bank_disconnected":
      return `${who} disconnected a bank`;
    case "budget_set":
      return `${who} changed a budget`;
    case "alert_rule_set":
      return `${who} changed an alert`;
    case "data_exported":
      return `${who} downloaded a copy of the data`;
    case "family_renamed":
      return `${who} renamed the family`;
    case "family_deleted":
      return `${who} deleted the family`;
    default:
      return `${who}: ${action.replace(/_/g, " ")}`;
  }
}

export const END_REASON: Record<string, string> = {
  revoked_by_dependent: "You stopped sharing",
  removed_by_guardian: "The guardian removed you",
  left_family: "You left the family",
  expired: "The period you chose ended",
  came_of_age: "You turned 18 — consent again for yourself to keep sharing",
  renewed: "Renewed",
  family_deleted: "The family was deleted",
};
