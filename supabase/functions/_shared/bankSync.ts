/**
 * From Pluggy's view of a connection to Flow's tables.
 *
 * Pluggy is the source of truth and is always asked directly: a webhook only
 * says *that* something changed, and its body is used for ids and nothing
 * else. So a forged or replayed webhook can at worst make Flow re-read data
 * the bank already gave it.
 *
 * Writes go through the database functions in 0012
 * (bank_upsert_connection, bank_upsert_accounts, bank_ingest_transactions),
 * which only store entries of accounts the person chose to share and never
 * store one twice.
 */
import { categorize } from "./categories.ts";
import type { Pluggy, PluggyAccount, PluggyItem, PluggyTransaction } from "./pluggy.ts";

export type ConnectionStatus = "updating" | "active" | "needs_attention" | "expired" | "error";

/** How far back the first read of a shared account goes. */
export const FIRST_SYNC_DAYS = 90;
/** Later reads overlap the previous one by this much, to catch late postings. */
const RESYNC_OVERLAP_DAYS = 7;
const BATCH = 500;
const MAX_CENTS = 999_999_999_999;

// Execution errors that need the person to do something at their bank.
const NEEDS_PERSON = new Set([
  "INVALID_CREDENTIALS",
  "INVALID_CREDENTIALS_MFA",
  "ACCOUNT_LOCKED",
  "ACCOUNT_CREDENTIALS_RESET",
  "ACCOUNT_NEEDS_ACTION",
  "USER_AUTHORIZATION_PENDING",
  "USER_INPUT_TIMEOUT",
]);

export function connectionStatus(item: PluggyItem, now: number = Date.now()): { status: ConnectionStatus; detail: string | null } {
  const code = item.error?.code ?? null;
  const consentEnds = item.consentExpiresAt ? Date.parse(item.consentExpiresAt) : NaN;
  if (Number.isFinite(consentEnds) && consentEnds <= now) return { status: "expired", detail: "CONSENT_EXPIRED" };
  if (code === "USER_AUTHORIZATION_NOT_GRANTED") return { status: "expired", detail: code };
  switch (item.status) {
    case "UPDATED":
      return { status: "active", detail: null };
    case "UPDATING":
    case "MERGING":
      return { status: "updating", detail: null };
    case "WAITING_USER_INPUT":
    case "WAITING_USER_ACTION":
      return { status: "needs_attention", detail: item.status };
    case "LOGIN_ERROR":
      return { status: code && !NEEDS_PERSON.has(code) ? "error" : "needs_attention", detail: code ?? item.status };
    case "OUTDATED":
    default:
      return { status: "error", detail: code ?? item.status ?? null };
  }
}

export interface AccountRow {
  external_id: string;
  kind: "checking" | "savings" | "credit_card";
  name: string;
  last4: string | null;
  currency: string;
}

export function accountRow(a: PluggyAccount): AccountRow {
  const kind =
    a.type === "CREDIT" || a.subtype === "CREDIT_CARD" ? "credit_card" : a.subtype === "SAVINGS_ACCOUNT" ? "savings" : "checking";
  const digits = (a.number ?? "").replace(/\D/g, "");
  return {
    external_id: a.id,
    kind,
    name: (a.marketingName || a.name || "").slice(0, 120),
    last4: digits ? digits.slice(-4) : null,
    currency: /^[A-Z]{3}$/.test(a.currencyCode ?? "") ? (a.currencyCode as string) : "BRL",
  };
}

export interface TransactionRow {
  external_id: string;
  amount: number;
  direction: "expense" | "income";
  description: string;
  merchant: string | null;
  category: string;
  date: string;
  status: "pending" | "posted";
  currency: string;
}

/**
 * One entry, as Flow stores it: integer cents, a direction, a category.
 *
 * Direction comes from Pluggy's `type` (DEBIT is money out). Only when it's
 * missing does the sign decide, and the sign means opposite things for a bank
 * account (negative = out) and a card (positive = a purchase).
 */
export function transactionRow(t: PluggyTransaction, account: Pick<AccountRow, "kind" | "currency">): TransactionRow {
  const inAccount = typeof t.amountInAccountCurrency === "number" && Number.isFinite(t.amountInAccountCurrency);
  const value = inAccount ? (t.amountInAccountCurrency as number) : t.amount;
  const direction: TransactionRow["direction"] =
    t.type === "DEBIT"
      ? "expense"
      : t.type === "CREDIT"
        ? "income"
        : account.kind === "credit_card"
          ? value > 0
            ? "expense"
            : "income"
          : value < 0
            ? "expense"
            : "income";
  const merchant = (t.merchant?.name || t.merchant?.businessName || "").trim() || null;
  const currency = inAccount ? account.currency : /^[A-Z]{3}$/.test(t.currencyCode ?? "") ? (t.currencyCode as string) : account.currency;
  return {
    external_id: t.id,
    amount: Math.min(MAX_CENTS, Math.round(Math.abs(value) * 100)),
    direction,
    description: (t.description ?? "").slice(0, 200),
    merchant: merchant ? merchant.slice(0, 200) : null,
    category: categorize({
      direction,
      category: t.category,
      merchantCategory: t.merchant?.category,
      merchantName: merchant,
      description: t.description,
      mcc: t.creditCardMetadata?.payeeMCC ?? null,
    }),
    date: new Date(t.date).toISOString(),
    status: t.status === "PENDING" ? "pending" : "posted",
    currency,
  };
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** A refusal with a short code the app can act on. */
export class SyncError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SyncError";
  }
}

interface StoredAccount {
  id: string;
  external_account_id: string;
  kind: AccountRow["kind"];
  currency: string;
  shared: boolean;
}

async function rpc<T>(admin: Admin, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** Store entries in batches. Returns how many were new. */
export async function ingest(admin: Admin, accountId: string, rows: TransactionRow[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const res = await rpc<{ inserted: number }>(admin, "bank_ingest_transactions", { p_account: accountId, p_rows: rows.slice(i, i + BATCH) });
    inserted += res?.inserted ?? 0;
  }
  return inserted;
}

export interface SyncResult {
  connectionId: string;
  status: ConnectionStatus;
  previousStatus: ConnectionStatus | null;
  accounts: number;
  inserted: number;
}

/**
 * Read one connection from Pluggy and store it: its state, its accounts, and
 * the entries of the shared accounts since the last read.
 *
 * `userId` is who the connection must belong to. Pluggy records the
 * `clientUserId` the connect token was made for; a connection made for
 * someone else is refused, so nobody can claim another person's bank by
 * sending its id.
 */
export async function syncConnection(
  admin: Admin,
  pluggy: Pluggy,
  userId: string,
  itemId: string,
  options: { now?: number; item?: PluggyItem } = {},
): Promise<SyncResult> {
  const now = options.now ?? Date.now();
  const item = options.item ?? (await pluggy.getItem(itemId));
  if (!item || item.clientUserId !== userId) {
    throw new SyncError("connection_not_yours");
  }

  // A connection Flow hasn't stored yet counts against the person's plan. The
  // connect token was only issued within it, but two widgets opened at once
  // could each finish; the one over the limit is ended at Pluggy, not kept.
  const { data: known } = await admin
    .from("bank_connections")
    .select("id")
    .eq("provider", "pluggy")
    .eq("external_item_id", itemId)
    .maybeSingle();
  if (!known) {
    const allowance = await rpc<{ allowed: boolean; reason: string | null }>(admin, "bank_connection_allowance", { p_user: userId });
    if (!allowance?.allowed) {
      await endItems(admin, pluggy, [itemId]);
      throw new SyncError(allowance?.reason ?? "plan_limit_connections");
    }
  }

  const { status, detail } = connectionStatus(item, now);
  const conn = await rpc<{ connection_id: string; previous_status: ConnectionStatus | null }>(admin, "bank_upsert_connection", {
    p_user: userId,
    p_item: itemId,
    p_institution: item.connector?.name ?? "",
    p_status: status,
    p_detail: detail,
    p_consent_expires: item.consentExpiresAt ?? null,
    p_synced: false,
  });

  // While the bank is being read, or the person has to act, accounts and
  // entries may be partial: leave what is stored as it is.
  if (status !== "active") {
    return { connectionId: conn.connection_id, status, previousStatus: conn.previous_status ?? null, accounts: 0, inserted: 0 };
  }

  const accounts = await rpc<StoredAccount[]>(admin, "bank_upsert_accounts", {
    p_connection: conn.connection_id,
    p_accounts: (await pluggy.listAccounts(itemId)).map(accountRow),
  });

  const { data: stored } = await admin.from("bank_connections").select("last_synced_at").eq("id", conn.connection_id).maybeSingle();
  const last = stored?.last_synced_at ? Date.parse(stored.last_synced_at) : NaN;

  let inserted = 0;
  for (const account of accounts.filter((a) => a.shared)) {
    // An account shared since the last read has nothing stored yet: it gets
    // the full first read, not just the overlap.
    const { data: existing } = await admin.from("bank_transactions").select("id").eq("account_id", account.id).limit(1);
    const fresh = !existing?.length || !Number.isFinite(last);
    const fromMs = fresh ? now - FIRST_SYNC_DAYS * 86_400_000 : last - RESYNC_OVERLAP_DAYS * 86_400_000;
    const dateFrom = new Date(fromMs).toISOString().slice(0, 10);
    const rows = (await pluggy.listTransactions(account.external_account_id, { dateFrom })).map((t) => transactionRow(t, account));
    inserted += await ingest(admin, account.id, rows);
  }

  // Marks the read as complete, which bank_ingest_transactions does only when
  // there was something to store.
  await rpc(admin, "bank_upsert_connection", {
    p_user: userId,
    p_item: itemId,
    p_institution: item.connector?.name ?? "",
    p_status: status,
    p_detail: detail,
    p_consent_expires: item.consentExpiresAt ?? null,
    p_synced: true,
  });

  return { connectionId: conn.connection_id, status, previousStatus: conn.previous_status ?? null, accounts: accounts.length, inserted };
}

/**
 * Entries Pluggy says are new, changed or gone in one account. Ignored for an
 * account Flow doesn't know or that isn't shared.
 */
export async function applyTransactionEvent(
  admin: Admin,
  pluggy: Pluggy,
  event: { event: string; itemId?: string; accountId?: string; transactionIds?: string[]; transactionsCreatedAtFrom?: string },
): Promise<number> {
  if (!event.itemId || !event.accountId) return 0;
  const { data: conn } = await admin
    .from("bank_connections")
    .select("id")
    .eq("provider", "pluggy")
    .eq("external_item_id", event.itemId)
    .maybeSingle();
  if (!conn) return 0;
  const { data: account } = await admin
    .from("bank_accounts")
    .select("id,external_account_id,kind,currency,shared")
    .eq("connection_id", conn.id)
    .eq("external_account_id", event.accountId)
    .maybeSingle();
  if (!account || !account.shared) return 0;

  if (event.event === "transactions/deleted") {
    return rpc<number>(admin, "bank_delete_transactions", { p_account: account.id, p_external_ids: event.transactionIds ?? [] });
  }
  let filter: { ids: string[] } | { createdAtFrom: string };
  if (event.event === "transactions/updated") {
    if (!event.transactionIds?.length) return 0;
    filter = { ids: event.transactionIds };
  } else {
    filter = { createdAtFrom: event.transactionsCreatedAtFrom ?? new Date(Date.now() - 86_400_000).toISOString() };
  }
  const rows = (await pluggy.listTransactions(account.external_account_id, filter)).map((t) => transactionRow(t, account));
  return ingest(admin, account.id, rows);
}

/** Pluggy says a connection is gone: forget it and what was read through it. */
export async function forgetItem(admin: Admin, itemId: string): Promise<boolean> {
  const { data } = await admin.from("bank_connections").select("id").eq("provider", "pluggy").eq("external_item_id", itemId).maybeSingle();
  if (!data) return false;
  await rpc(admin, "bank_remove_connection", { p_connection: data.id });
  return true;
}

/**
 * End connections at Pluggy. One that can't be ended now (Pluggy unreachable)
 * is written down in bank_item_tombstones and retried later; the caller goes
 * on regardless, because a person deleting their account must not be stopped
 * by a third party being down.
 */
export async function endItems(admin: Admin, pluggy: Pluggy | null, itemIds: string[]): Promise<{ ended: string[]; deferred: string[] }> {
  const ended: string[] = [];
  const deferred: string[] = [];
  for (const id of itemIds) {
    try {
      if (!pluggy) throw new Error("Pluggy is not configured");
      await pluggy.deleteItem(id);
      ended.push(id);
    } catch (e) {
      deferred.push(id);
      const message = String((e as Error)?.message ?? e).slice(0, 300);
      console.error("endItems:", id, message);
      await admin
        .from("bank_item_tombstones")
        .upsert({ provider: "pluggy", external_item_id: id, last_error: message }, { onConflict: "provider,external_item_id" });
    }
  }
  return { ended, deferred };
}

/** Try again to end connections that couldn't be ended before. */
export async function retryTombstones(admin: Admin, pluggy: Pluggy, limit = 5): Promise<number> {
  const { data } = await admin.from("bank_item_tombstones").select("external_item_id,attempts").order("created_at").limit(limit);
  let done = 0;
  for (const row of (data ?? []) as { external_item_id: string; attempts: number }[]) {
    try {
      await pluggy.deleteItem(row.external_item_id);
      await admin.from("bank_item_tombstones").delete().eq("external_item_id", row.external_item_id);
      done += 1;
    } catch (e) {
      await admin
        .from("bank_item_tombstones")
        .update({ attempts: row.attempts + 1, last_error: String((e as Error)?.message ?? e).slice(0, 300) })
        .eq("external_item_id", row.external_item_id);
    }
  }
  return done;
}
