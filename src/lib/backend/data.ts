/**
 * Data service: maps app types ↔ Supabase rows and reads/writes per-user data.
 * Row Level Security scopes every query to the signed-in user, so filters by
 * user_id are for indexing/clarity, not the security boundary.
 *
 * The store uses this in a local-first way: mutate local state immediately, then
 * persist here in the background. Receipts stay local for now (a receipt_path
 * column + storage bucket exist for wiring uploads later).
 */
import { getSupabase } from "./client";
import type { AppData, Budget, Category, Preferences, Subscription, Transaction } from "@/data/types";

function sb() {
  const c = getSupabase();
  if (!c) throw new Error("Backend not configured");
  return c;
}

/* ── mappers ─────────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

function rowToTx(r: Row): Transaction {
  return {
    id: String(r.id),
    amount: Number(r.amount),
    direction: (r.direction as Transaction["direction"]) ?? "expense",
    description: String(r.description ?? ""),
    categoryId: String(r.category ?? ""),
    date: String(r.date),
    note: (r.note as string) || undefined,
    merchant: (r.merchant as string) || undefined,
    currency: String(r.currency ?? "USD"),
    source: (r.source as Transaction["source"]) ?? "manual",
  };
}
function txToRow(userId: string, t: Transaction): Row {
  return {
    id: t.id,
    user_id: userId,
    amount: t.amount,
    direction: t.direction,
    description: t.description,
    category: t.categoryId,
    date: t.date,
    merchant: t.merchant ?? null,
    note: t.note ?? null,
    currency: t.currency,
    source: t.source ?? "manual",
  };
}

function rowToSub(r: Row): Subscription {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    amount: Number(r.amount),
    currency: String(r.currency ?? "USD"),
    frequency: (r.frequency as Subscription["frequency"]) ?? "monthly",
    customIntervalDays: (r.custom_interval_days as number) ?? undefined,
    nextChargeAt: String(r.next_charge_at ?? new Date().toISOString()),
    status: (r.status as Subscription["status"]) ?? "active",
    categoryId: String(r.category ?? ""),
    reminders: Boolean(r.reminders ?? true),
  };
}
function subToRow(userId: string, s: Subscription): Row {
  return {
    id: s.id,
    user_id: userId,
    name: s.name,
    amount: s.amount,
    currency: s.currency,
    frequency: s.frequency,
    custom_interval_days: s.customIntervalDays ?? null,
    next_charge_at: s.nextChargeAt,
    status: s.status,
    category: s.categoryId,
    reminders: s.reminders,
  };
}

function rowToCategory(r: Row): Category {
  return { id: String(r.id), label: String(r.label), custom: Boolean(r.custom ?? true) };
}
function rowToBudget(r: Row): Budget {
  const scope = String(r.scope ?? "total");
  return { id: `bud_${scope}`, scope: scope as Budget["scope"], label: String(r.label ?? "Monthly budget"), limit: Number(r["limit"] ?? 0) };
}

/* ── reads ───────────────────────────────────────────────────────────────── */

export async function fetchAllData(userId: string): Promise<Partial<AppData>> {
  const c = sb();
  const [tx, subs, cats, buds, prefs] = await Promise.all([
    c.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }),
    c.from("subscriptions").select("*").eq("user_id", userId),
    c.from("categories").select("*").eq("user_id", userId),
    c.from("budgets").select("*").eq("user_id", userId),
    c.from("preferences").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const out: Partial<AppData> = {};
  if (tx.data) out.transactions = (tx.data as Row[]).map(rowToTx);
  if (subs.data) out.subscriptions = (subs.data as Row[]).map(rowToSub);
  if (cats.data) out.categories = (cats.data as Row[]).map(rowToCategory);
  if (buds.data && (buds.data as Row[]).length) out.budgets = (buds.data as Row[]).map(rowToBudget);
  if (prefs.data) {
    const p = prefs.data as Row;
    out.preferences = {
      locale: String(p.locale ?? "en-US"),
      currency: String(p.currency ?? "USD"),
      hideAmounts: false,
      biometricLock: false,
      useStatusColor: false,
      gmailConnected: Boolean(p.gmail_connected ?? false),
    } as Preferences;
  }
  return out;
}

/* ── writes (fire-and-forget from the store) ─────────────────────────────── */

export async function upsertTransaction(userId: string, t: Transaction): Promise<void> {
  await sb().from("transactions").upsert(txToRow(userId, t));
}
export async function upsertTransactions(userId: string, txs: Transaction[]): Promise<void> {
  if (!txs.length) return;
  await sb().from("transactions").upsert(txs.map((t) => txToRow(userId, t)));
}
export async function deleteTransactionRow(_userId: string, id: string): Promise<void> {
  await sb().from("transactions").delete().eq("id", id);
}

export async function upsertSubscription(userId: string, s: Subscription): Promise<void> {
  await sb().from("subscriptions").upsert(subToRow(userId, s));
}
export async function deleteSubscriptionRow(_userId: string, id: string): Promise<void> {
  await sb().from("subscriptions").delete().eq("id", id);
}

export async function upsertCategory(userId: string, c: Category): Promise<void> {
  await sb().from("categories").upsert({ id: c.id, user_id: userId, label: c.label, custom: c.custom ?? true });
}
export async function deleteCategoryRow(_userId: string, id: string): Promise<void> {
  await sb().from("categories").delete().eq("id", id);
}

export async function upsertBudget(userId: string, b: Budget): Promise<void> {
  await sb().from("budgets").upsert({ user_id: userId, scope: b.scope, label: b.label, limit: b.limit });
}

export async function updatePreferences(userId: string, patch: Partial<Preferences>): Promise<void> {
  const row: Row = { user_id: userId };
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.locale !== undefined) row.locale = patch.locale;
  if (patch.gmailConnected !== undefined) row.gmail_connected = patch.gmailConnected;
  await sb().from("preferences").upsert(row);
}

/**
 * Delete the account itself, via the `delete-account` Edge Function.
 *
 * The client can clear its own rows but cannot remove the auth user — that
 * needs the service role key. Doing only the rows leaves the login intact, so
 * signing up again with the same address just reopens the old, now-empty
 * account. Apple treats that as not having deleted the account at all
 * (Guideline 5.1.1(v)).
 *
 * Throws if it didn't work, so the UI can say so rather than claiming success.
 */
export async function deleteAccount(): Promise<void> {
  const c = sb();
  const { data, error } = await c.functions.invoke("delete-account", { body: {} });
  if (error) throw error;
  if (!(data as { deleted?: boolean })?.deleted) throw new Error("The account could not be deleted.");
}

/** Delete all of the user's rows (client-side, RLS-scoped). Auth user removal is admin-only. */
export async function deleteAllData(userId: string): Promise<void> {
  const c = sb();
  await Promise.all([
    c.from("transactions").delete().eq("user_id", userId),
    c.from("subscriptions").delete().eq("user_id", userId),
    c.from("categories").delete().eq("user_id", userId),
    c.from("budgets").delete().eq("user_id", userId),
    c.from("preferences").delete().eq("user_id", userId),
  ]);
  // Also remove the user's uploaded receipt files from storage.
  try {
    const { data: files } = await c.storage.from("receipts").list(userId);
    if (files && files.length) {
      await c.storage.from("receipts").remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch {
    /* ignore — table rows are the primary record */
  }
}
