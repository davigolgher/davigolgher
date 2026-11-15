/**
 * Flow Family, from the app's side: every call to the database functions and
 * Edge Functions in supabase/prepared/0011–0015 and supabase/functions/bank-*.
 *
 * The app never reads another person's rows directly. A guardian reads a
 * dependent's spending only through `family_transactions` and
 * `family_dependent_overview`, which check the consent and record the access
 * on the server; there is no table the app could query around them.
 *
 * Errors come back as FamilyError with the server's short code (`no_access`,
 * `plan_limit_dependents`…) and a sentence for the screen.
 */
import { getSupabase } from "./client";
import type { FamilyCategory } from "@/lib/family/categories";

/* ── Types: what the server returns ─────────────────────────────────────── */

export type DependentKind = "adult" | "minor" | "ward";
export type ConsentStatus = "active" | "revoked" | "expired";
export type Plan = "free" | "paid";

export interface Consent {
  id: string;
  status: ConsentStatus;
  given_by: "self" | "legal_representative";
  term_version: string;
  months: number;
  granted_at: string;
  expires_at: string;
  ended_at: string | null;
  end_reason: string | null;
  guardian_id?: string;
}

export interface GuardianView {
  family: { id: string; name: string; created_at: string };
  display_name: string;
  plan: Plan;
  dependents: {
    user_id: string;
    display_name: string;
    kind: DependentKind;
    joined_at: string;
    locked: boolean;
    consent: Consent | null;
  }[];
  invites: { id: string; label: string; kind: DependentKind; months: number; expires_at: string; created_at: string }[];
}

export interface DependentView {
  family: { id: string; name: string };
  display_name: string;
  kind: DependentKind;
  can_self_consent: boolean;
  joined_at: string;
  guardians: { user_id: string; display_name: string; email: string | null }[];
  consent: Consent | null;
}

export interface FamilyState {
  user_id: string;
  plan: Plan;
  term_version: string;
  guardian_of: GuardianView | null;
  dependent_of: DependentView[];
}

export interface InvitePreview {
  found: boolean;
  own_invite?: boolean;
  family_name?: string;
  guardian_name?: string;
  guardian_email?: string | null;
  kind?: DependentKind;
  label?: string;
  months?: number;
  term_version?: string;
  expires_at?: string;
}

export interface BankEntry {
  id: string;
  account_id: string;
  amount: number;
  direction: "expense" | "income";
  description: string;
  merchant: string | null;
  category: FamilyCategory;
  date: string;
  status: "pending" | "posted";
  currency: string;
}

export type ConnectionStatus = "updating" | "active" | "needs_attention" | "expired" | "error";

/** How the app opens a connection: Pluggy's widget in the app, or a provider page in the system browser. */
export type BankLinkStart =
  | { provider: "pluggy"; connectToken: string; includeSandbox: boolean }
  | { provider: "plaid" | "saltedge"; url: string; session: string; returnUrl: string };

export interface Overview {
  accounts: { id: string; name: string; kind: string; last4: string | null; currency: string; institution: string; locked: boolean }[];
  connections: {
    id: string;
    institution: string;
    status: ConnectionStatus;
    provider?: "pluggy" | "plaid" | "saltedge";
    country?: string | null;
    consent_expires_at: string | null;
    last_synced_at: string | null;
  }[];
  budgets: { category: FamilyCategory | "total"; limit: number; currency?: string }[];
  rules: { kind: AlertKind; enabled: boolean; threshold: number | null; categories: FamilyCategory[] | null; currency?: string | null }[];
}

export type AlertKind = "large_purchase" | "sensitive_category" | "budget_exceeded" | "connection_expired";

export interface AlertEvent {
  id: string;
  family_id: string;
  guardian_id: string;
  dependent_id: string;
  kind: AlertKind;
  detail: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  transaction_id: string | null;
}

export interface MyConnection {
  id: string;
  external_item_id: string;
  provider: "pluggy" | "plaid" | "saltedge";
  country_code: string | null;
  institution_name: string;
  status: ConnectionStatus;
  status_detail: string | null;
  consent_expires_at: string | null;
  last_synced_at: string | null;
  orphaned_at: string | null;
  created_at: string;
  accounts: { id: string; kind: string; name: string; last4: string | null; currency: string; shared: boolean; shared_at: string | null }[];
}

export interface AuditEntry {
  id: number;
  family_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  subject_id: string | null;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

/** What each server code means, said to the person on the screen. */
const MESSAGES: Record<string, string> = {
  not_signed_in: "Sign in again, then try again.",
  no_access: "You no longer have access to this person's spending.",
  not_a_guardian: "Only the family's guardian can do that.",
  not_the_owner: "Only the person who created the family can do that.",
  not_a_dependent: "Join a family before connecting a bank.",
  family_exists: "You already have a family. Manage it from the Family screen.",
  already_a_member: "You're already part of this family.",
  cannot_join_own_family: "That's your own invitation. Send it to the person you want to add.",
  too_many_families: "You can share with up to five families.",
  invite_invalid: "That code isn't valid. Check it with the person who invited you — codes last 7 days and work once.",
  too_many_attempts: "Too many wrong codes. Wait an hour and try again.",
  new_invite_required: "This sharing ended too long ago to renew. Ask for a new invitation.",
  plan_limit_dependents: "The free plan includes one dependent. Subscribe to Flow to add more.",
  plan_limit_accounts: "The free plan shares one account. The guardian can subscribe to share more.",
  plan_limit_connections: "The free plan includes one bank connection. The guardian can subscribe for more.",
  plan_limit_alerts: "Category and budget alerts come with a Flow subscription.",
  too_many_connections: "You've reached the maximum number of bank connections.",
  term_outdated: "The sharing terms changed. Read the new version to continue.",
  adult_confirmation_required: "Confirm that you're 18 or older to consent for yourself.",
  representative_required: "A parent or legal representative has to consent first.",
  representative_declaration_required: "Confirm that you're their parent or legal representative.",
  dependent_must_consent: "They're an adult now, so they renew the sharing themselves.",
  birthdate_mismatch: "That date of birth doesn't match the invitation.",
  not_a_minor: "This invitation was for someone under 18. Ask for a new one.",
  invalid_birthdate: "Check the date of birth.",
  invalid_name: "Use a name between 1 and 60 characters.",
  invalid_kind: "Choose who you're inviting.",
  invalid_months: "Choose 3, 6 or 12 months.",
  invalid_amount: "Enter an amount greater than zero.",
  invalid_category: "Choose a category from the list.",
  account_not_found: "That account wasn't found. Refresh and try again.",
  connection_not_found: "That bank connection wasn't found.",
  connection_not_yours: "That bank connection wasn't found.",
  sync_failed: "Couldn't update from the bank right now. Your data is safe; try again in a moment.",
  provider_unavailable: "Bank connections in this country aren't available yet.",
  invalid_currency: "Choose a currency.",
  invalid_time_zone: "Your phone's time zone wasn't recognised.",
  unavailable: "This isn't available right now. Try again in a moment.",
  network: "You're offline. Showing what was saved on this phone.",
};

export class FamilyError extends Error {
  constructor(
    readonly code: string,
    message?: string,
    readonly status?: number,
  ) {
    super(message ?? MESSAGES[code] ?? "Something went wrong. Try again.");
    this.name = "FamilyError";
  }
}

export const messageFor = (code: string) => MESSAGES[code] ?? "Something went wrong. Try again.";

function client() {
  const c = getSupabase();
  if (!c) throw new FamilyError("unavailable");
  return c;
}

function isNetworkError(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e).toLowerCase();
  return m.includes("network request failed") || m.includes("failed to fetch") || m.includes("network error");
}

/** The database answers a refusal with its short code as the message (0011's family_fail). */
function fromPostgrest(error: { message?: string; code?: string } | null): FamilyError {
  const raw = error?.message ?? "";
  if (isNetworkError(raw)) return new FamilyError("network");
  const code = /^[a-z_]+$/.test(raw) ? raw : "unavailable";
  return new FamilyError(code);
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    const { data, error } = await client().rpc(fn, args);
    if (error) throw fromPostgrest(error);
    return data as T;
  } catch (e) {
    if (e instanceof FamilyError) throw e;
    throw isNetworkError(e) ? new FamilyError("network") : new FamilyError("unavailable");
  }
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const c = client();
  const { data: auth } = await c.auth.getSession();
  if (!auth.session) throw new FamilyError("not_signed_in");
  try {
    const { data, error } = await c.functions.invoke(name, { body });
    if (error) {
      const res = (error as { context?: Response }).context;
      if (res && typeof res.json === "function") {
        const parsed = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
        throw new FamilyError(parsed?.code ?? "unavailable", parsed?.error, res.status);
      }
      throw isNetworkError(error) ? new FamilyError("network") : new FamilyError("unavailable");
    }
    return data as T;
  } catch (e) {
    if (e instanceof FamilyError) throw e;
    throw isNetworkError(e) ? new FamilyError("network") : new FamilyError("unavailable");
  }
}

/* ── Family, invitations, consent ───────────────────────────────────────── */

export const familyApi = {
  myState: () => rpc<FamilyState>("family_my_state"),

  create: (name: string, displayName: string) => rpc<string>("family_create", { p_name: name, p_display_name: displayName }),
  rename: (familyId: string, name: string) => rpc<void>("family_rename", { p_family: familyId, p_name: name }),

  createInvite: (args: {
    familyId: string;
    kind: DependentKind;
    label: string;
    months: number;
    birthdate?: string | null;
    representativeDeclared?: boolean;
    termVersion: string;
  }) =>
    rpc<{ invite_id: string; code: string; expires_at: string }>("family_invite_create", {
      p_family: args.familyId,
      p_kind: args.kind,
      p_label: args.label,
      p_months: args.months,
      p_birthdate: args.birthdate ?? null,
      p_rep_declared: args.representativeDeclared ?? false,
      p_term_version: args.termVersion,
    }),
  revokeInvite: (inviteId: string) => rpc<void>("family_invite_revoke", { p_invite: inviteId }),
  previewInvite: (code: string) => rpc<InvitePreview>("family_invite_preview", { p_code: code }),
  acceptInvite: (args: { code: string; displayName: string; termVersion: string; months: number; confirmAdult: boolean; birthdate?: string | null }) =>
    rpc<{ ok: boolean; reason?: string; family_id?: string; consent_id?: string; expires_at?: string }>("family_invite_accept", {
      p_code: args.code,
      p_display_name: args.displayName,
      p_term_version: args.termVersion,
      p_months: args.months,
      p_confirm_adult: args.confirmAdult,
      p_birthdate: args.birthdate ?? null,
    }),

  revokeConsent: (familyId: string) => rpc<void>("family_consent_revoke", { p_family: familyId }),
  renewConsent: (familyId: string, termVersion: string, months: number, confirmAdult: boolean) =>
    rpc<unknown>("family_consent_renew", { p_family: familyId, p_term_version: termVersion, p_months: months, p_confirm_adult: confirmAdult }),
  renewAsRepresentative: (familyId: string, dependentId: string, termVersion: string, months: number) =>
    rpc<unknown>("family_consent_renew_as_representative", {
      p_family: familyId,
      p_dependent: dependentId,
      p_term_version: termVersion,
      p_months: months,
      p_rep_declared: true,
    }),

  leave: (familyId: string) => rpc<void>("family_leave", { p_family: familyId }),
  removeMember: (familyId: string, userId: string) => rpc<void>("family_member_remove", { p_family: familyId, p_user: userId }),
  deleteFamily: (familyId: string) => rpc<void>("family_delete", { p_family: familyId }),

  /* ── The guardian's view ─────────────────────────────────────────────── */

  transactions: (dependentId: string, from?: Date, to?: Date, limit = 500, offset = 0) =>
    rpc<BankEntry[]>("family_transactions", {
      p_dependent: dependentId,
      p_from: from?.toISOString() ?? null,
      p_to: to?.toISOString() ?? null,
      p_limit: limit,
      p_offset: offset,
    }),
  overview: (dependentId: string) => rpc<Overview>("family_dependent_overview", { p_dependent: dependentId }),
  setBudget: (familyId: string, dependentId: string, category: FamilyCategory | "total", limit: number | null, currency?: string) =>
    rpc<void>("family_budget_set", { p_family: familyId, p_dependent: dependentId, p_category: category, p_limit: limit, p_currency: currency ?? null }),
  setRule: (args: {
    familyId: string;
    dependentId: string;
    kind: AlertKind;
    enabled: boolean;
    threshold?: number | null;
    categories?: FamilyCategory[] | null;
    currency?: string | null;
  }) =>
    rpc<void>("family_alert_rule_set", {
      p_family: args.familyId,
      p_dependent: args.dependentId,
      p_kind: args.kind,
      p_enabled: args.enabled,
      p_threshold: args.threshold ?? null,
      p_categories: args.categories ?? null,
      p_currency: args.currency ?? null,
    }),
  /** Alerts this guardian received (a dependent can also read the ones about them; those are left out here). */
  alerts: async (guardianId: string, limit = 100): Promise<AlertEvent[]> => {
    const { data, error } = await client()
      .from("family_alert_events")
      .select("id,family_id,guardian_id,dependent_id,kind,detail,created_at,read_at,transaction_id")
      .eq("guardian_id", guardianId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw fromPostgrest(error);
    return (data ?? []) as AlertEvent[];
  },
  markAlertsRead: (ids: string[] | null) => rpc<void>("family_alerts_mark_read", { p_ids: ids }),

  /* ── The dependent's side ────────────────────────────────────────────── */

  myConnections: async (): Promise<MyConnection[]> => {
    const { data, error } = await client()
      .from("bank_connections")
      .select(
        "id,external_item_id,provider,country_code,institution_name,status,status_detail,consent_expires_at,last_synced_at,orphaned_at,created_at,accounts:bank_accounts(id,kind,name,last4,currency,shared,shared_at)",
      )
      .order("created_at");
    if (error) throw fromPostgrest(error);
    return (data ?? []) as MyConnection[];
  },
  setAccountShared: (accountId: string, shared: boolean) => rpc<void>("bank_account_set_shared", { p_account: accountId, p_shared: shared }),

  /** Who did what, about me or by me: the access history. */
  activity: async (limit = 200): Promise<AuditEntry[]> => {
    const { data, error } = await client()
      .from("family_audit_log")
      .select("id,family_id,actor_id,actor_name,subject_id,action,detail,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw fromPostgrest(error);
    return (data ?? []) as AuditEntry[];
  },

  /** Transparency: the alert rules and budgets guardians set about this person. */
  aboutMe: async (userId: string) => {
    const c = client();
    const [rules, budgets] = await Promise.all([
      c.from("family_alert_rules").select("kind,enabled,threshold,categories,currency,guardian_id").eq("dependent_id", userId),
      c.from("family_budgets").select("category,limit,currency,guardian_id").eq("dependent_id", userId),
    ]);
    if (rules.error) throw fromPostgrest(rules.error);
    if (budgets.error) throw fromPostgrest(budgets.error);
    return {
      rules: (rules.data ?? []) as {
        kind: AlertKind;
        enabled: boolean;
        threshold: number | null;
        categories: FamilyCategory[] | null;
        currency: string | null;
        guardian_id: string;
      }[],
      budgets: (budgets.data ?? []) as { category: FamilyCategory | "total"; limit: number; currency: string; guardian_id: string }[],
    };
  },

  /** So a dependent's months end at their own midnight (0016). */
  setTimeZone: (tz: string) => rpc<void>("family_set_time_zone", { p_tz: tz }),

  exportMyData: () => rpc<Record<string, unknown>>("family_export_my_data"),

  /* ── Bank, through the Edge Functions ────────────────────────────────── */

  /** Which providers this server has switched on. */
  bankCoverage: () => invoke<{ providers: Record<"pluggy" | "plaid" | "saltedge", boolean> }>("bank-connect-token", { probe: true }),
  /** Open a connection: a new one in a country, or a stored one to fix it. */
  connectToken: (target: { country: string } | { connectionId: string }) => invoke<BankLinkStart>("bank-connect-token", target),
  /** Read: a Pluggy item, a finished browser window, or a stored connection. */
  syncConnection: (target: { itemId: string } | { session: string } | { connectionId: string }) =>
    invoke<{ status: ConnectionStatus | null; accounts: number; inserted: number; connections?: number }>("bank-connection-sync", target),
  disconnect: (connectionId: string) => invoke<{ removed: boolean; providerPending: boolean }>("bank-connection-delete", { connectionId }),

  /* ── Push ────────────────────────────────────────────────────────────── */

  registerPushToken: (token: string, platform: "ios" | "android") => rpc<void>("push_token_register", { p_token: token, p_platform: platform }),
  removePushToken: (token: string) => rpc<void>("push_token_remove", { p_token: token }),

  /**
   * Live signals: "something changed for this dependent", and nothing more
   * (0013). Row Level Security decides which signals reach this person, so no
   * filter is needed here; the data itself is then read through the checked
   * functions above.
   */
  subscribe(
    key: string,
    onSignal: (signal: { dependent_id: string; kind: string }) => void,
    onStatus?: (live: boolean) => void,
  ): () => void {
    const c = getSupabase();
    if (!c) return () => {};
    const channel = c
      .channel(`family-signals-${key}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "family_sync_signals" }, (payload) => {
        const row = payload.new as { dependent_id?: string; kind?: string };
        onSignal({ dependent_id: row.dependent_id ?? "", kind: row.kind ?? "" });
      })
      .subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
    return () => {
      void c.removeChannel(channel);
    };
  },
};
