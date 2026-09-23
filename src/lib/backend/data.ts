/**
 * Data service: maps app types ↔ Supabase rows and reads/writes per-user data.
 * Row Level Security scopes every query to the signed-in user, so filters by
 * user_id are for indexing/clarity, not the security boundary.
 *
 * The store uses this in a local-first way: mutate local state immediately, then
 * persist here through its sync queue (see data/outbox). Every write throws a
 * SyncError when Supabase refuses it — supabase-js returns errors rather than
 * throwing them, so a write that ignored its `error` failed without a trace.
 */
import { getSupabase } from "./client";
import type { AppData, Budget, Category, Preferences, Subscription, Transaction } from "@/data/types";
import { SyncError, type Op } from "@/data/outbox";

function sb() {
  const c = getSupabase();
  if (!c) throw new Error("Backend not configured");
  return c;
}

/** Turn a Supabase `{ error, status }` into a thrown SyncError. */
function check(res: { error: { message: string; code?: string } | null; status: number }): void {
  if (res.error) throw new SyncError(res.error.message, res.status, res.error.code || undefined);
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

/**
 * The API returns at most 1,000 rows per request (Supabase's default), and
 * past that the rest are silently left off — a year of daily entries would
 * have lost its oldest months from every total. So read in pages.
 */
const PAGE = 1000;

async function selectAll(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null; status: number }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await page(from, from + PAGE - 1);
    check(res);
    const batch = (res.data ?? []) as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/**
 * Everything the account holds. Throws if any part fails: a partial load would
 * show, say, subscriptions without transactions, and totals built on it would
 * be wrong with nothing to say so.
 */
export async function fetchAllData(userId: string): Promise<Partial<AppData>> {
  const c = sb();
  const [tx, subs, cats, buds, prefs, days] = await Promise.all([
    selectAll((a, b) =>
      c.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).order("id").range(a, b),
    ),
    selectAll((a, b) => c.from("subscriptions").select("*").eq("user_id", userId).order("id").range(a, b)),
    selectAll((a, b) => c.from("categories").select("*").eq("user_id", userId).order("created_at").order("id").range(a, b)),
    c.from("budgets").select("*").eq("user_id", userId),
    c.from("preferences").select("*").eq("user_id", userId).maybeSingle(),
    // A streak only ever looks back a few weeks; a year is plenty.
    c.from("activity_days").select("day").eq("user_id", userId).order("day", { ascending: false }).limit(400),
  ]);
  check(buds);
  check(prefs);
  check(days);

  const out: Partial<AppData> = {
    transactions: tx.map(rowToTx),
    subscriptions: subs.map(rowToSub),
    categories: cats.map(rowToCategory),
    activeDays: ((days.data ?? []) as Row[]).map((r) => String(r.day)),
  };
  if (buds.data && (buds.data as Row[]).length) out.budgets = (buds.data as Row[]).map(rowToBudget);
  if (prefs.data) {
    const p = prefs.data as Row;
    out.preferences = {
      locale: String(p.locale ?? "en-US"),
      currency: String(p.currency ?? "USD"),
      hideAmounts: false,
      biometricLock: false,
      useStatusColor: false,
    } as Preferences;
  }
  return out;
}

/* ── writes (sent by the store's sync queue) ───────────────────────────────── */

/**
 * Record that this account reviewed `day`. Keyed on (user, day) with conflicts
 * ignored, so a double tap or a second device is a no-op rather than an error.
 * The database refuses a day more than one away from its own date (migration
 * 0007), so a streak can't be rebuilt by writing past days.
 */
export async function recordActiveDay(userId: string, day: string): Promise<void> {
  const { error } = await sb()
    .from("activity_days")
    .upsert({ user_id: userId, day }, { onConflict: "user_id,day", ignoreDuplicates: true });
  if (error) throw error;
}

export async function upsertTransaction(userId: string, t: Transaction): Promise<void> {
  check(await sb().from("transactions").upsert(txToRow(userId, t)));
}
export async function upsertTransactions(userId: string, txs: Transaction[]): Promise<void> {
  if (!txs.length) return;
  check(await sb().from("transactions").upsert(txs.map((t) => txToRow(userId, t))));
}
export async function deleteTransactionRow(_userId: string, id: string): Promise<void> {
  check(await sb().from("transactions").delete().eq("id", id));
}

export async function upsertSubscription(userId: string, s: Subscription): Promise<void> {
  check(await sb().from("subscriptions").upsert(subToRow(userId, s)));
}
export async function deleteSubscriptionRow(_userId: string, id: string): Promise<void> {
  check(await sb().from("subscriptions").delete().eq("id", id));
}

export async function upsertCategory(userId: string, c: Category): Promise<void> {
  check(await sb().from("categories").upsert({ id: c.id, user_id: userId, label: c.label, custom: c.custom ?? true }));
}
export async function deleteCategoryRow(_userId: string, id: string): Promise<void> {
  check(await sb().from("categories").delete().eq("id", id));
}

export async function upsertBudget(userId: string, b: Budget): Promise<void> {
  check(await sb().from("budgets").upsert({ user_id: userId, scope: b.scope, label: b.label, limit: b.limit }));
}

export async function updatePreferences(userId: string, patch: Partial<Preferences>): Promise<void> {
  const row: Row = { user_id: userId };
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.locale !== undefined) row.locale = patch.locale;
  check(await sb().from("preferences").upsert(row));
}

/** Send one queued change. */
export async function sendOp(userId: string, op: Op): Promise<void> {
  switch (op.kind) {
    case "tx.upsert":
      return upsertTransaction(userId, op.tx);
    case "tx.delete":
      return deleteTransactionRow(userId, op.id);
    case "sub.upsert":
      return upsertSubscription(userId, op.sub);
    case "sub.delete":
      return deleteSubscriptionRow(userId, op.id);
    case "cat.upsert":
      return upsertCategory(userId, op.category);
    case "cat.delete":
      return deleteCategoryRow(userId, op.id);
    case "budget.upsert":
      return upsertBudget(userId, op.budget);
    case "prefs.update":
      return updatePreferences(userId, op.prefs);
  }
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
  // With no session, invoke() quietly sends the anon key instead of a user
  // token, and the function answers "missing sub claim" — accurate, and
  // meaningless to anyone reading it on a phone. Stop before the round trip.
  const { data: auth } = await c.auth.getSession();
  if (!auth.session) {
    throw new Error("You're signed out, so there's no account here to delete. Sign in to it first.");
  }
  const { data, error } = await c.functions.invoke("delete-account", { body: {} });
  if (error) throw new Error(await describeFunctionError(error));
  if (!(data as { deleted?: boolean })?.deleted) throw new Error("The account could not be deleted.");
}

/**
 * Get the real reason out of a failed Edge Function call.
 *
 * supabase-js reports every one of them as "Edge Function returned a non-2xx
 * status code" and puts what actually happened in the response body, which it
 * attaches as `context`. Unread, that's the difference between a message
 * naming the problem and one that only says there was one — and this message is
 * all anyone sees when account deletion fails.
 */
async function describeFunctionError(error: unknown): Promise<string> {
  const res = (error as { context?: Response }).context;
  if (!res || typeof res.text !== "function") {
    return (error as Error)?.message || "The account could not be deleted.";
  }
  try {
    const body = await res.text();
    let detail = body;
    let step: string | undefined;
    try {
      const parsed = JSON.parse(body) as { error?: string; step?: string };
      detail = parsed.error ?? body;
      step = parsed.step;
    } catch {
      /* not JSON — the raw body is still better than nothing */
    }
    if (!detail) return `The function failed with HTTP ${res.status}.`;
    // The step narrows a page of possible causes to one line to check.
    return step ? `${detail}\n\n(step: ${step}, HTTP ${res.status})` : `${detail} (HTTP ${res.status})`;
  } catch {
    return `The function failed with HTTP ${res.status}.`;
  }
}

