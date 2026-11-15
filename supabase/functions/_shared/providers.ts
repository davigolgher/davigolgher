/**
 * Plaid and Salt Edge, in the same shape Pluggy has in bankSync.ts: connect,
 * read, store, end. All writes go through the same database functions
 * (bank_upsert_connection, bank_upsert_accounts, bank_ingest_transactions),
 * so sharing rules, deduplication, alerts and the orphan rule apply alike.
 *
 * Whose connection: a connection is only ever stored for the person who
 * opened the window it was made in (bank_link_sessions), or — for one read
 * again later — the person it is already stored for. A Salt Edge connection
 * must also belong to that person's Salt Edge customer.
 */
import { categorize, type FamilyCategory } from "./categories.ts";
import { openSecret, sealSecret } from "./crypto.ts";
import { ingest, SyncError, type AccountRow, type ConnectionStatus, type TransactionRow } from "./bankSync.ts";
import type { Env } from "./http.ts";
import { Plaid, PlaidApiError, type PlaidAccount, type PlaidEnvironment, type PlaidItem, type PlaidTransaction } from "./plaid.ts";
import { pluggyFromEnv, type Fetch, type Pluggy } from "./pluggy.ts";
import type { ProviderId } from "./regions.ts";
import { SaltEdge, SaltEdgeError, type SaltEdgeAccount, type SaltEdgeConnection, type SaltEdgeTransaction } from "./saltedge.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

const MAX_CENTS = 999_999_999_999;
const LINK_SESSION_MINUTES = 30;

/* ── Configuration ─────────────────────────────────────────────────────── */

export interface Providers {
  pluggy: Pluggy | null;
  plaid(environment: PlaidEnvironment): Plaid | null;
  /** The Plaid environment a given person uses (review accounts may use the sandbox). */
  plaidEnvironmentFor(userId: string): PlaidEnvironment;
  saltedge: SaltEdge | null;
  tokenKey: string;
}

export function providersFromEnv(env: Env, fetcher?: Fetch): Providers {
  const plaidSecret = (environment: PlaidEnvironment) =>
    environment === env.plaidEnvironment ? env.plaidSecret : environment === "sandbox" ? env.plaidSandboxSecret : "";
  return {
    pluggy: pluggyFromEnv(env, fetcher),
    plaid(environment) {
      const secret = plaidSecret(environment);
      if (!env.plaidClientId || !secret || !env.bankTokenKey) return null;
      return new Plaid({ clientId: env.plaidClientId, secret, environment }, fetcher);
    },
    plaidEnvironmentFor(userId) {
      return env.plaidEnvironment === "production" && env.plaidSandboxSecret && env.sandboxUserIds.includes(userId) ? "sandbox" : env.plaidEnvironment;
    },
    saltedge:
      env.saltedgeAppId && env.saltedgeSecret
        ? new SaltEdge({ appId: env.saltedgeAppId, secret: env.saltedgeSecret, privateKeyPem: env.saltedgePrivateKey || undefined, baseUrl: env.saltedgeBaseUrl || undefined }, fetcher)
        : null,
    tokenKey: env.bankTokenKey,
  };
}

/** Providers from parts, for tests and callers that only have some. */
export function providersOf(parts: Partial<Providers> = {}): Providers {
  return {
    pluggy: null,
    plaid: () => null,
    plaidEnvironmentFor: () => "sandbox",
    saltedge: null,
    tokenKey: "",
    ...parts,
  };
}

export function availability(p: Providers): Record<ProviderId, boolean> {
  return { pluggy: Boolean(p.pluggy), plaid: Boolean(p.plaid("production") ?? p.plaid("sandbox")), saltedge: Boolean(p.saltedge) };
}

/* ── Mapping: Plaid ────────────────────────────────────────────────────── */

const PFC_DETAILED: Record<string, FamilyCategory> = {
  TRANSFER_IN_ACCOUNT_TRANSFER: "Internal",
  TRANSFER_OUT_ACCOUNT_TRANSFER: "Internal",
  TRANSFER_IN_SAVINGS: "Internal",
  TRANSFER_OUT_SAVINGS: "Internal",
  TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: "Internal",
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: "Internal",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "Internal",
  ENTERTAINMENT_CASINOS_AND_GAMBLING: "Betting & lotteries",
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "Taxes",
  GENERAL_SERVICES_EDUCATION: "Education",
};

const PFC_PRIMARY: Record<string, FamilyCategory> = {
  INCOME: "Income",
  TRANSFER_IN: "Transfers",
  TRANSFER_OUT: "Transfers",
  LOAN_PAYMENTS: "Loans & fees",
  BANK_FEES: "Loans & fees",
  ENTERTAINMENT: "Entertainment",
  FOOD_AND_DRINK: "Eating out",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Shopping",
  MEDICAL: "Health",
  PERSONAL_CARE: "Health",
  GENERAL_SERVICES: "Services",
  GOVERNMENT_AND_NON_PROFIT: "Services",
  TRANSPORTATION: "Transport",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Housing & bills",
};

const GAMBLING_MCC = new Set(["7800", "7801", "7802", "7995"]);

export function plaidCategory(t: PlaidTransaction, direction: "expense" | "income"): FamilyCategory {
  const detailed = t.personal_finance_category?.detailed ?? "";
  const primary = t.personal_finance_category?.primary ?? "";
  if (PFC_DETAILED[detailed] === "Internal") return "Internal";
  if (direction === "income") return "Income";
  if (t.merchant_category_code && GAMBLING_MCC.has(t.merchant_category_code)) return "Betting & lotteries";
  if (PFC_DETAILED[detailed]) return PFC_DETAILED[detailed];
  if (PFC_PRIMARY[primary] && PFC_PRIMARY[primary] !== "Income") return PFC_PRIMARY[primary];
  return categorize({
    direction,
    category: (detailed || primary).replace(/_/g, " "),
    merchantName: t.merchant_name,
    description: t.name,
    mcc: Number(t.merchant_category_code) || null,
  });
}

export function plaidStatus(item: PlaidItem): { status: ConnectionStatus; detail: string | null } {
  const code = item.error?.error_code ?? null;
  if (!code) return { status: "active", detail: null };
  if (code === "ITEM_LOGIN_REQUIRED" || code === "PENDING_EXPIRATION" || code === "INVALID_UPDATED_USERNAME") return { status: "needs_attention", detail: code };
  if (code === "USER_PERMISSION_REVOKED" || code === "ACCESS_NOT_GRANTED" || code === "CONSENT_EXPIRED") return { status: "expired", detail: code };
  return { status: "error", detail: code };
}

const ccy = (...codes: (string | null | undefined)[]) => codes.find((c) => typeof c === "string" && /^[A-Z]{3}$/.test(c)) ?? null;

/** A Plaid account as Flow stores it; investment and loan accounts aren't shared. */
export function plaidAccountRow(a: PlaidAccount): AccountRow | null {
  if (a.type !== "depository" && a.type !== "credit") return null;
  return {
    external_id: a.account_id,
    kind: a.type === "credit" ? "credit_card" : a.subtype === "savings" ? "savings" : "checking",
    name: (a.official_name || a.name || "").slice(0, 120),
    last4: a.mask ? a.mask.replace(/\D/g, "").slice(-4) || null : null,
    currency: ccy(a.balances?.iso_currency_code) ?? "USD",
  };
}

/** Plaid: a positive amount is money leaving the account, for bank accounts and cards alike. */
export function plaidTransactionRow(t: PlaidTransaction, account: Pick<AccountRow, "currency">): TransactionRow {
  const direction = t.amount >= 0 ? "expense" : "income";
  const when = t.datetime || t.authorized_datetime || `${t.date}T12:00:00Z`;
  return {
    external_id: t.transaction_id,
    amount: Math.min(MAX_CENTS, Math.round(Math.abs(t.amount) * 100)),
    direction,
    description: (t.name || t.original_description || "").slice(0, 200),
    merchant: t.merchant_name ? t.merchant_name.slice(0, 200) : null,
    category: plaidCategory(t, direction),
    date: new Date(when).toISOString(),
    status: t.pending ? "pending" : "posted",
    currency: ccy(t.iso_currency_code) ?? account.currency,
  };
}

/* ── Mapping: Salt Edge ────────────────────────────────────────────────── */

export function saltEdgeStatus(c: SaltEdgeConnection): { status: ConnectionStatus; detail: string | null } {
  switch (c.status) {
    case "active":
      return { status: "active", detail: null };
    case "inactive":
      return { status: "needs_attention", detail: "inactive" };
    case "disabled":
      return { status: "expired", detail: "disabled" };
    default:
      return { status: "error", detail: c.status ?? null };
  }
}

const SE_CARD = new Set(["card", "credit_card", "credit"]);
const SE_CHECKING = new Set(["account", "checking", "debit_card", "ewallet", "bonus"]);

export function saltEdgeAccountRow(a: SaltEdgeAccount): AccountRow | null {
  const kind = SE_CARD.has(a.nature) ? "credit_card" : a.nature === "savings" ? "savings" : SE_CHECKING.has(a.nature) ? "checking" : null;
  if (!kind) return null;
  const number = a.extra?.account_number || a.extra?.iban || a.extra?.masked_pan || a.extra?.cards?.[0] || "";
  const digits = number.replace(/\D/g, "");
  return {
    external_id: String(a.id),
    kind,
    name: (a.name || "").slice(0, 120),
    last4: digits ? digits.slice(-4) : null,
    currency: ccy(a.currency_code) ?? "EUR",
  };
}

/** Salt Edge: a negative amount is money leaving the account. */
export function saltEdgeTransactionRow(t: SaltEdgeTransaction, account: Pick<AccountRow, "currency">): TransactionRow {
  const direction = t.amount < 0 ? "expense" : "income";
  const merchant = (t.extra?.payee ?? "").trim() || null;
  return {
    external_id: String(t.id),
    amount: Math.min(MAX_CENTS, Math.round(Math.abs(t.amount) * 100)),
    direction,
    description: (t.description || "").slice(0, 200),
    merchant: merchant ? merchant.slice(0, 200) : null,
    category: categorize({ direction, category: (t.category ?? "").replace(/_/g, " "), merchantName: merchant, description: t.description }),
    date: new Date(`${t.made_on}T12:00:00Z`).toISOString(),
    status: t.status === "pending" ? "pending" : "posted",
    currency: ccy(t.currency_code) ?? account.currency,
  };
}

/* ── Shared steps ──────────────────────────────────────────────────────── */

async function rpc<T>(admin: Admin, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

interface StoredAccount {
  id: string;
  external_account_id: string;
  kind: AccountRow["kind"];
  currency: string;
  shared: boolean;
}

interface StoredConnection {
  id: string;
  user_id: string;
  provider: ProviderId;
  external_item_id: string;
  institution_name: string;
  country_code: string | null;
  orphaned_at: string | null;
}

async function knownConnection(admin: Admin, provider: ProviderId, externalId: string): Promise<StoredConnection | null> {
  const { data } = await admin
    .from("bank_connections")
    .select("id,user_id,provider,external_item_id,institution_name,country_code,orphaned_at")
    .eq("provider", provider)
    .eq("external_item_id", externalId)
    .maybeSingle();
  return (data as StoredConnection) ?? null;
}

/** A new connection counts against the person's plan; one over it is refused. */
async function assertAllowance(admin: Admin, userId: string): Promise<void> {
  const allowance = await rpc<{ allowed: boolean; reason: string | null }>(admin, "bank_connection_allowance", { p_user: userId });
  if (!allowance?.allowed) throw new SyncError(allowance?.reason ?? "plan_limit_connections");
}

async function hasEntries(admin: Admin, accountId: string): Promise<boolean> {
  const { data } = await admin.from("bank_transactions").select("id").eq("account_id", accountId).limit(1);
  return Boolean(data?.length);
}

export interface WorldSyncResult {
  connectionId: string;
  status: ConnectionStatus;
  accounts: number;
  inserted: number;
}

export interface LinkSession {
  id: string;
  user_id: string;
  provider: "plaid" | "saltedge";
  external_ref: string;
  environment: PlaidEnvironment;
  country_code: string | null;
  reconnect_connection: string | null;
  expires_at: string;
  completed_at: string | null;
}

async function openSession(
  admin: Admin,
  row: Omit<LinkSession, "id" | "completed_at" | "expires_at"> & { expires_at?: string },
): Promise<string> {
  const { data, error } = await admin
    .from("bank_link_sessions")
    .insert({ ...row, expires_at: row.expires_at ?? new Date(Date.now() + LINK_SESSION_MINUTES * 60_000).toISOString() })
    .select("id")
    .single();
  if (error || !data) throw new Error(`bank_link_sessions: ${error?.message ?? "insert failed"}`);
  return data.id as string;
}

export async function loadSession(admin: Admin, sessionId: string, userId: string): Promise<LinkSession> {
  const { data } = await admin.from("bank_link_sessions").select("*").eq("id", sessionId).maybeSingle();
  // Someone else's window and one that doesn't exist look the same.
  if (!data || data.user_id !== userId) throw new SyncError("connection_not_yours");
  return data as LinkSession;
}

/* ── Plaid ─────────────────────────────────────────────────────────────── */

export async function plaidLinkStart(
  admin: Admin,
  p: Providers,
  args: { userId: string; country: string; webhook: string; returnUrl: string; reconnect?: StoredConnection },
): Promise<{ session: string; url: string }> {
  const environment = p.plaidEnvironmentFor(args.userId);
  const plaid = p.plaid(environment);
  if (!plaid) throw new SyncError("provider_unavailable");
  let accessToken: string | undefined;
  if (args.reconnect) {
    const { data } = await admin.from("bank_credentials").select("secret").eq("connection_id", args.reconnect.id).maybeSingle();
    if (!data) throw new SyncError("connection_not_found");
    accessToken = await openSecret(data.secret, p.tokenKey);
  }
  const link = await plaid.createHostedLink({
    clientUserId: args.userId,
    country: args.country,
    webhook: args.webhook,
    completionRedirectUri: `${args.returnUrl}?provider=plaid`,
    accessToken,
  });
  if (!link.hosted_link_url) throw new Error("Plaid returned no hosted link URL");
  const session = await openSession(admin, {
    user_id: args.userId,
    provider: "plaid",
    external_ref: link.link_token,
    environment,
    country_code: args.country,
    reconnect_connection: args.reconnect?.id ?? null,
    expires_at: link.expiration,
  });
  return { session, url: link.hosted_link_url };
}

/** Store the banks a finished Plaid Link session connected, then read them. */
export async function plaidLinkComplete(admin: Admin, p: Providers, session: LinkSession): Promise<WorldSyncResult[]> {
  // Already finished (Plaid's webhook got here first): its public tokens are
  // spent and the connections stored; nothing more to do.
  if (session.completed_at) return [];
  const plaid = p.plaid(session.environment);
  if (!plaid) throw new SyncError("provider_unavailable");
  const results: WorldSyncResult[] = [];

  if (session.reconnect_connection) {
    results.push(await syncPlaidConnection(admin, p, session.reconnect_connection));
  } else {
    for (const { publicToken, institution } of await plaid.linkResults(session.external_ref)) {
      const { access_token, item_id } = await plaid.exchange(publicToken);
      if (!(await knownConnection(admin, "plaid", item_id))) {
        try {
          await assertAllowance(admin, session.user_id);
        } catch (e) {
          await plaid.removeItem(access_token).catch(() => {});
          throw e;
        }
      }
      const conn = await rpc<{ connection_id: string }>(admin, "bank_upsert_connection", {
        p_user: session.user_id,
        p_item: item_id,
        p_institution: institution ?? "",
        p_status: "updating",
        p_provider: "plaid",
        p_country: session.country_code,
      });
      const { error } = await admin.from("bank_credentials").upsert(
        { connection_id: conn.connection_id, secret: await sealSecret(access_token, p.tokenKey), environment: session.environment, sync_cursor: null },
        { onConflict: "connection_id" },
      );
      if (error) throw new Error(`bank_credentials: ${error.message}`);
      results.push(await syncPlaidConnection(admin, p, conn.connection_id));
    }
  }
  await admin.from("bank_link_sessions").update({ completed_at: new Date().toISOString() }).eq("id", session.id);
  return results;
}

/** Read one stored Plaid connection: its state, accounts, and what changed since the last read. */
export async function syncPlaidConnection(admin: Admin, p: Providers, connectionId: string): Promise<WorldSyncResult> {
  const { data: conn } = await admin
    .from("bank_connections")
    .select("id,user_id,provider,external_item_id,institution_name,country_code,orphaned_at")
    .eq("id", connectionId)
    .maybeSingle();
  const { data: cred } = await admin.from("bank_credentials").select("secret,environment,sync_cursor").eq("connection_id", connectionId).maybeSingle();
  if (!conn || conn.provider !== "plaid" || !cred) throw new SyncError("connection_not_found");
  const plaid = p.plaid(cred.environment);
  if (!plaid) throw new SyncError("provider_unavailable");
  const accessToken = await openSecret(cred.secret, p.tokenKey);

  let item: PlaidItem;
  try {
    item = await plaid.getItem(accessToken);
  } catch (e) {
    if (e instanceof PlaidApiError && e.error.error_code) item = { item_id: conn.external_item_id, error: e.error, consent_expiration_time: null };
    else throw e;
  }
  const { status, detail } = plaidStatus(item);
  const institution =
    conn.institution_name || item.institution_name || (item.institution_id ? await plaid.institutionName(item.institution_id, conn.country_code ?? "US") : null) || "";
  const upsert = (synced: boolean) =>
    rpc(admin, "bank_upsert_connection", {
      p_user: conn.user_id,
      p_item: conn.external_item_id,
      p_institution: institution,
      p_status: status,
      p_detail: detail,
      p_consent_expires: item.consent_expiration_time,
      p_synced: synced,
      p_provider: "plaid",
      p_country: conn.country_code,
    });
  await upsert(false);
  if (status !== "active") return { connectionId, status, accounts: 0, inserted: 0 };

  const accounts = await rpc<StoredAccount[]>(admin, "bank_upsert_accounts", {
    p_connection: connectionId,
    p_accounts: (await plaid.accounts(accessToken)).map(plaidAccountRow).filter(Boolean),
  });
  if (conn.orphaned_at) return { connectionId, status, accounts: accounts.length, inserted: 0 };

  const shared = accounts.filter((a) => a.shared);
  // A newly shared account has nothing stored: read from the beginning again
  // (entries already stored are recognised, not doubled).
  let cursor: string | null = cred.sync_cursor;
  for (const a of shared) if (!(await hasEntries(admin, a.id))) cursor = null;

  const changes = await plaid.sync(accessToken, cursor);
  let inserted = 0;
  for (const a of shared) {
    const rows = [...changes.added, ...changes.modified].filter((t) => t.account_id === a.external_account_id).map((t) => plaidTransactionRow(t, a));
    if (rows.length) inserted += await ingest(admin, a.id, rows);
    const gone = changes.removed.filter((r) => r.account_id === a.external_account_id).map((r) => r.transaction_id);
    if (gone.length) await rpc(admin, "bank_delete_transactions", { p_account: a.id, p_external_ids: gone });
  }
  await admin.from("bank_credentials").update({ sync_cursor: changes.cursor, updated_at: new Date().toISOString() }).eq("connection_id", connectionId);
  await upsert(true);
  return { connectionId, status, accounts: accounts.length, inserted };
}

/* ── Salt Edge ─────────────────────────────────────────────────────────── */

export async function saltEdgeCustomer(admin: Admin, se: SaltEdge, userId: string): Promise<string> {
  const { data } = await admin.from("bank_customers").select("external_customer_id").eq("user_id", userId).eq("provider", "saltedge").maybeSingle();
  if (data) return data.external_customer_id as string;
  let id: string | null = null;
  try {
    id = await se.createCustomer(userId);
  } catch (e) {
    if (!(e instanceof SaltEdgeError) || (e.status !== 409 && e.errorClass !== "DuplicatedCustomer")) throw e;
    id = await se.findCustomer(userId);
  }
  if (!id) throw new Error("Salt Edge customer could not be created");
  const { error } = await admin
    .from("bank_customers")
    .upsert({ user_id: userId, provider: "saltedge", external_customer_id: id }, { onConflict: "user_id,provider" });
  if (error) throw new Error(`bank_customers: ${error.message}`);
  return id;
}

export async function saltEdgeLinkStart(
  admin: Admin,
  p: Providers,
  args: { userId: string; country: string | null; returnUrl: string; includeFakeProviders: boolean; reconnect?: StoredConnection },
): Promise<{ session: string; url: string }> {
  const se = p.saltedge;
  if (!se) throw new SyncError("provider_unavailable");
  const customerId = await saltEdgeCustomer(admin, se, args.userId);
  const { url, expiresAt } = await se.connectUrl({
    customerId,
    returnTo: `${args.returnUrl}?provider=saltedge`,
    country: args.country,
    includeFakeProviders: args.includeFakeProviders,
    reconnectConnectionId: args.reconnect?.external_item_id,
  });
  const session = await openSession(admin, {
    user_id: args.userId,
    provider: "saltedge",
    external_ref: customerId,
    environment: args.includeFakeProviders ? "sandbox" : "production",
    country_code: args.country,
    reconnect_connection: args.reconnect?.id ?? null,
    expires_at: expiresAt,
  });
  return { session, url };
}

/** Store what the person connected in a Salt Edge window, then read it. */
export async function saltEdgeLinkComplete(admin: Admin, p: Providers, session: LinkSession): Promise<WorldSyncResult[]> {
  const se = p.saltedge;
  if (!se) throw new SyncError("provider_unavailable");
  const results: WorldSyncResult[] = [];
  for (const c of await se.connections(session.external_ref)) {
    results.push(await syncSaltEdgeConnection(admin, p, session.user_id, c.id, { connection: c, country: session.country_code }));
  }
  await admin.from("bank_link_sessions").update({ completed_at: new Date().toISOString() }).eq("id", session.id);
  return results;
}

export async function syncSaltEdgeConnection(
  admin: Admin,
  p: Providers,
  userId: string,
  externalId: string,
  options: { connection?: SaltEdgeConnection; country?: string | null } = {},
): Promise<WorldSyncResult> {
  const se = p.saltedge;
  if (!se) throw new SyncError("provider_unavailable");
  const c = options.connection ?? (await se.connection(externalId));
  const { data: customer } = await admin.from("bank_customers").select("external_customer_id").eq("user_id", userId).eq("provider", "saltedge").maybeSingle();
  if (!customer || String(c.customer_id) !== String(customer.external_customer_id)) throw new SyncError("connection_not_yours");

  const known = await knownConnection(admin, "saltedge", c.id);
  if (!known) {
    try {
      await assertAllowance(admin, userId);
    } catch (e) {
      await se.removeConnection(c.id).catch(() => {});
      throw e;
    }
  }
  const { status, detail } = saltEdgeStatus(c);
  const country = c.country_code && /^[A-Z]{2}$/i.test(c.country_code) ? c.country_code.toUpperCase() : (options.country ?? null);
  const upsert = (synced: boolean) =>
    rpc<{ connection_id: string }>(admin, "bank_upsert_connection", {
      p_user: userId,
      p_item: c.id,
      p_institution: c.provider_name ?? "",
      p_status: status,
      p_detail: detail,
      p_synced: synced,
      p_provider: "saltedge",
      p_country: country,
    });
  const conn = await upsert(false);
  if (status !== "active") return { connectionId: conn.connection_id, status, accounts: 0, inserted: 0 };

  const accounts = await rpc<StoredAccount[]>(admin, "bank_upsert_accounts", {
    p_connection: conn.connection_id,
    p_accounts: (await se.accounts(c.id)).map(saltEdgeAccountRow).filter(Boolean),
  });
  if (known?.orphaned_at) return { connectionId: conn.connection_id, status, accounts: accounts.length, inserted: 0 };

  let inserted = 0;
  for (const a of accounts.filter((x) => x.shared)) {
    const rows = (await se.transactions(c.id, a.external_account_id)).filter((t) => !t.duplicated).map((t) => saltEdgeTransactionRow(t, a));
    if (rows.length) inserted += await ingest(admin, a.id, rows);
  }
  await upsert(true);
  return { connectionId: conn.connection_id, status, accounts: accounts.length, inserted };
}

/* ── Ending connections, any provider ──────────────────────────────────── */

export interface EndTarget {
  provider: ProviderId;
  externalId: string;
  credential?: string | null;
  environment?: PlaidEnvironment | null;
}

export async function endAtProvider(p: Providers, t: EndTarget): Promise<void> {
  if (t.provider === "pluggy") {
    if (!p.pluggy) throw new Error("Pluggy is not configured");
    return p.pluggy.deleteItem(t.externalId);
  }
  if (t.provider === "plaid") {
    const plaid = p.plaid(t.environment ?? "production");
    if (!plaid || !t.credential) throw new Error("Plaid is not configured, or the connection has no credential");
    return plaid.removeItem(await openSecret(t.credential, p.tokenKey));
  }
  if (!p.saltedge) throw new Error("Salt Edge is not configured");
  return p.saltedge.removeConnection(t.externalId);
}

/**
 * End connections at their providers. One that can't be ended now waits in
 * bank_item_tombstones (with its encrypted credential, nothing about the
 * person) and is retried; the caller goes on regardless.
 */
export async function endConnections(admin: Admin, p: Providers, targets: EndTarget[]): Promise<{ ended: number; deferred: number }> {
  let ended = 0;
  let deferred = 0;
  for (const t of targets) {
    try {
      await endAtProvider(p, t);
      ended += 1;
    } catch (e) {
      deferred += 1;
      const message = String((e as Error)?.message ?? e).slice(0, 300);
      console.error("endConnections:", t.provider, message);
      await admin.from("bank_item_tombstones").upsert(
        { provider: t.provider, external_item_id: t.externalId, last_error: message, credential: t.credential ?? null, environment: t.environment ?? null },
        { onConflict: "provider,external_item_id" },
      );
    }
  }
  return { ended, deferred };
}

/** What's needed to end a stored connection: its provider, id and credential. */
export async function endTargetFor(admin: Admin, connectionId: string): Promise<EndTarget | null> {
  const { data: conn } = await admin.from("bank_connections").select("provider,external_item_id").eq("id", connectionId).maybeSingle();
  if (!conn) return null;
  const { data: cred } = await admin.from("bank_credentials").select("secret,environment").eq("connection_id", connectionId).maybeSingle();
  return { provider: conn.provider, externalId: conn.external_item_id, credential: cred?.secret ?? null, environment: cred?.environment ?? null };
}

export async function retryAllTombstones(admin: Admin, p: Providers, limit = 5): Promise<number> {
  const { data } = await admin
    .from("bank_item_tombstones")
    .select("provider,external_item_id,attempts,credential,environment")
    .order("created_at")
    .limit(limit);
  let done = 0;
  for (const row of (data ?? []) as { provider: ProviderId; external_item_id: string; attempts: number; credential: string | null; environment: PlaidEnvironment | null }[]) {
    try {
      await endAtProvider(p, { provider: row.provider, externalId: row.external_item_id, credential: row.credential, environment: row.environment });
      await admin.from("bank_item_tombstones").delete().eq("provider", row.provider).eq("external_item_id", row.external_item_id);
      done += 1;
    } catch (e) {
      await admin
        .from("bank_item_tombstones")
        .update({ attempts: row.attempts + 1, last_error: String((e as Error)?.message ?? e).slice(0, 300) })
        .eq("provider", row.provider)
        .eq("external_item_id", row.external_item_id);
    }
  }
  return done;
}
