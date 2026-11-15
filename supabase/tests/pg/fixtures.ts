/**
 * People, families and bank data for the database tests. Everything is
 * fictitious; each call makes fresh accounts, so tests don't see one
 * another's rows.
 */
import { expect } from "vitest";
import { CONSENT_TERM_VERSION } from "@/lib/family/consentTerm";
import type { TestDb } from "./harness";

export const V = CONSENT_TERM_VERSION;

let seq = 0;

export async function user(db: TestDb, label: string): Promise<string> {
  seq += 1;
  return db.createUser(`${label}.${seq}@example.test`);
}

export async function paid(db: TestDb, userId: string): Promise<void> {
  await db.admin(
    "insert into public.billing (user_id, status, current_period_end) values ($1, 'active', now() + interval '30 days') on conflict (user_id) do update set status = 'active', current_period_end = now() + interval '30 days'",
    [userId],
  );
}

export async function unpaid(db: TestDb, userId: string): Promise<void> {
  await db.admin("update public.billing set status = 'inactive' where user_id = $1", [userId]);
}

/** A guardian with a family. */
export async function family(db: TestDb, opts: { paid?: boolean } = {}) {
  const guardian = await user(db, "guardian");
  if (opts.paid) await paid(db, guardian);
  const res = await db.as(guardian).rpc<string>("family_create", { p_name: "The Silvas", p_display_name: "Maria" });
  expect(res.error).toBeNull();
  return { guardian, familyId: res.data as string };
}

/** Add an adult dependent, consented, to a family. */
export async function join(db: TestDb, guardian: string, familyId: string, name = "Ana"): Promise<string> {
  const dependent = await user(db, "dependent");
  const inv = await db
    .as(guardian)
    .rpc<{ code: string }>("family_invite_create", { p_family: familyId, p_kind: "adult", p_label: name });
  expect(inv.error).toBeNull();
  const acc = await db.as(dependent).rpc<{ ok: boolean }>("family_invite_accept", {
    p_code: inv.data!.code,
    p_display_name: name,
    p_term_version: V,
    p_confirm_adult: true,
  });
  expect(acc.error).toBeNull();
  expect(acc.data?.ok).toBe(true);
  return dependent;
}

/** A guardian, a family and one adult dependent who has consented. */
export async function sharing(db: TestDb, opts: { paid?: boolean } = {}) {
  const f = await family(db, opts);
  const dependent = await join(db, f.guardian, f.familyId);
  return { ...f, dependent };
}

let item = 0;

export interface Bank {
  connectionId: string;
  itemId: string;
  /** In the order given: checking, then card. */
  accounts: { id: string; kind: string; external_account_id: string }[];
}

/** Connect a (fictitious) bank for this person, as the Edge Function would. */
export async function connectBank(db: TestDb, userId: string, institution = "Banco Fictício"): Promise<Bank> {
  item += 1;
  const itemId = `item-${item}`;
  const conn = await db.service().rpc<{ connection_id: string }>("bank_upsert_connection", {
    p_user: userId,
    p_item: itemId,
    p_institution: institution,
    p_status: "active",
    p_synced: true,
  });
  expect(conn.error).toBeNull();
  const accounts = await db.service().rpc<Bank["accounts"]>("bank_upsert_accounts", {
    p_connection: conn.data!.connection_id,
    p_accounts: [
      { external_id: `${itemId}-checking`, kind: "checking", name: "Conta Corrente", last4: "0001-4321", currency: "BRL" },
      { external_id: `${itemId}-card`, kind: "credit_card", name: "Cartão", last4: "9876", currency: "BRL" },
    ],
  });
  expect(accounts.error).toBeNull();
  // Both rows share a creation time, so the function's order between them is
  // arbitrary; put them in the order this fixture promises.
  const byKind = (k: string) => accounts.data!.find((a) => a.kind === k)!;
  return { connectionId: conn.data!.connection_id, itemId, accounts: [byKind("checking"), byKind("credit_card")] };
}

export const share = (db: TestDb, userId: string, accountId: string, shared = true) =>
  db.as(userId).rpc("bank_account_set_shared", { p_account: accountId, p_shared: shared });

let txn = 0;

export interface BankRow {
  external_id: string;
  amount: number;
  direction: "expense" | "income";
  description: string;
  merchant?: string;
  category: string;
  date: string;
  status: "pending" | "posted";
  currency: string;
}

/** A bank entry dated now unless told otherwise. */
export function entry(over: Partial<BankRow> = {}): BankRow {
  txn += 1;
  return {
    external_id: `tx-${txn}`,
    amount: 2590,
    direction: "expense",
    description: "Padaria Estrela",
    merchant: "Padaria Estrela",
    category: "Eating out",
    date: new Date().toISOString(),
    status: "posted",
    currency: "BRL",
    ...over,
  };
}

export const ingest = (db: TestDb, accountId: string, rows: BankRow[]) =>
  db.service().rpc<{ inserted: number; updated: number }>("bank_ingest_transactions", { p_account: accountId, p_rows: rows });

/** A dependent sharing a checking account with their guardian, with a bank connected. */
export async function sharingWithBank(db: TestDb, opts: { paid?: boolean } = {}) {
  const s = await sharing(db, opts);
  const bank = await connectBank(db, s.dependent);
  expect((await share(db, s.dependent, bank.accounts[0].id)).error).toBeNull();
  return { ...s, bank, checking: bank.accounts[0].id, card: bank.accounts[1].id };
}

export interface FeedRow {
  id: string;
  account_id: string;
  amount: number;
  direction: string;
  description: string;
  merchant: string | null;
  category: string;
  date: string;
  status: string;
  currency: string;
}

export const feed = (db: TestDb, viewer: string, dependent: string, args: Record<string, unknown> = {}) =>
  db.as(viewer).rpc<FeedRow[]>("family_transactions", { p_dependent: dependent, ...args });
