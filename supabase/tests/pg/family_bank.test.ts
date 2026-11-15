// @vitest-environment node
/**
 * 0012 and 0013 against a real Postgres: bank connections and entries, who
 * reads them, the record of each read, budgets and live signals.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type TestDb } from "./harness";
import { connectBank, entry, family, feed, ingest, join, paid, share, sharing, sharingWithBank, unpaid, user, V } from "./fixtures";

let db: TestDb;

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

describe("bank data: who can touch it", () => {
  it("without a session: nothing", async () => {
    for (const t of ["bank_connections", "bank_accounts", "bank_transactions", "bank_webhook_events", "bank_item_tombstones", "family_budgets", "family_sync_signals"]) {
      expect((await db.anon().from(t).select("*")).error?.code, t).toBe("42501");
    }
    expect((await db.anon().rpc("family_transactions", { p_dependent: "00000000-0000-0000-0000-000000000001" })).error?.code).toBe("42501");
  });

  it("the owner reads their own connection, accounts and entries, and can write none of them", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry()]);
    const me = db.as(s.dependent);
    expect((await me.from("bank_connections").select("institution_name,status")).data).toEqual([{ institution_name: "Banco Fictício", status: "active" }]);
    expect((await me.from("bank_accounts").select("kind")).data).toHaveLength(2);
    expect((await me.from("bank_transactions").select("description")).data).toEqual([{ description: "Padaria Estrela" }]);

    // The entries a guardian relies on can't be edited or removed by the person they describe.
    expect((await me.from("bank_transactions").update({ amount: 1 }).eq("user_id", s.dependent)).error?.code).toBe("42501");
    expect((await me.from("bank_transactions").delete().eq("user_id", s.dependent)).error?.code).toBe("42501");
    expect((await me.from("bank_transactions").insert({ user_id: s.dependent, account_id: s.checking, external_id: "x", amount: 1, direction: "expense", date: new Date().toISOString() })).error?.code).toBe("42501");
    expect((await me.from("bank_accounts").update({ shared: true }).eq("user_id", s.dependent)).error?.code).toBe("42501");
  });

  it("the guardian has no direct access to any of it — not even with consent", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry()]);
    const g = db.as(s.guardian);
    expect((await g.from("bank_transactions").select("*")).data).toEqual([]);
    expect((await g.from("bank_accounts").select("*")).data).toEqual([]);
    expect((await g.from("bank_connections").select("*")).data).toEqual([]);
  });

  it("the functions that write bank data are for the server only", async () => {
    const s = await sharingWithBank(db);
    for (const who of [s.dependent, s.guardian]) {
      const c = db.as(who);
      expect((await c.rpc("bank_ingest_transactions", { p_account: s.checking, p_rows: [entry()] })).error?.code).toBe("42501");
      expect((await c.rpc("bank_upsert_connection", { p_user: who, p_item: "forged", p_institution: "x", p_status: "active" })).error?.code).toBe("42501");
      expect((await c.rpc("bank_upsert_accounts", { p_connection: s.bank.connectionId, p_accounts: [] })).error?.code).toBe("42501");
      expect((await c.rpc("bank_remove_connection", { p_connection: s.bank.connectionId })).error?.code).toBe("42501");
      expect((await c.rpc("bank_delete_transactions", { p_account: s.checking, p_external_ids: [] })).error?.code).toBe("42501");
      expect((await c.rpc("family_signal", { p_dependent: s.dependent, p_kind: "transactions" })).error?.code).toBe("42501");
    }
  });
});

describe("accounts and sharing", () => {
  it("accounts arrive unshared, with only the last four digits", async () => {
    const s = await sharing(db);
    const bank = await connectBank(db, s.dependent);
    const rows = await db.admin<{ shared: boolean; last4: string }>("select shared, last4 from public.bank_accounts where connection_id = $1 order by created_at, id", [bank.connectionId]);
    expect(rows.map((r) => r.shared)).toEqual([false, false]);
    expect(rows.map((r) => r.last4).sort()).toEqual(["4321", "9876"]);
  });

  it("nothing is stored for an account that isn't shared", async () => {
    const s = await sharing(db);
    const bank = await connectBank(db, s.dependent);
    const res = await ingest(db, bank.accounts[0].id, [entry()]);
    expect(res.error?.message).toBe("account_not_shared");
  });

  it("only the owner can share an account, and only someone who is in a family", async () => {
    const s = await sharing(db);
    const bank = await connectBank(db, s.dependent);
    expect((await share(db, s.guardian, bank.accounts[0].id)).error?.message).toBe("account_not_found");
    const loner = await user(db, "loner");
    const loneBank = await connectBank(db, loner);
    expect((await share(db, loner, loneBank.accounts[0].id)).error?.message).toBe("not_a_dependent");
  });

  it("free plan: one shared account; paid: more", async () => {
    const s = await sharingWithBank(db);
    const second = await share(db, s.dependent, s.card);
    expect(second.status).toBe(402);
    expect(second.error?.message).toBe("plan_limit_accounts");
    await paid(db, s.guardian);
    expect((await share(db, s.dependent, s.card)).error).toBeNull();
  });

  it("unsharing deletes what was stored from that account, and is recorded", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry(), entry()]);
    expect((await share(db, s.dependent, s.checking, false)).error).toBeNull();
    const left = await db.admin<{ n: number }>("select count(*)::int as n from public.bank_transactions where account_id = $1", [s.checking]);
    expect(left[0].n).toBe(0);
    expect((await feed(db, s.guardian, s.dependent)).data).toEqual([]);
    const log = await db.as(s.dependent).from("family_audit_log").select("action").order("id");
    expect((log.data as { action: string }[]).map((r) => r.action)).toEqual(
      expect.arrayContaining(["bank_connected", "account_shared", "account_unshared"]),
    );
  });

  it("how many banks someone may connect follows the family's plan", async () => {
    const loner = await user(db, "loner");
    const none = await db.service().rpc<Record<string, unknown>>("bank_connection_allowance", { p_user: loner });
    expect(none.data).toMatchObject({ allowed: false, reason: "not_a_dependent" });

    const s = await sharing(db);
    const first = await db.service().rpc<Record<string, unknown>>("bank_connection_allowance", { p_user: s.dependent });
    expect(first.data).toMatchObject({ allowed: true, plan: "free", max: 1 });
    await connectBank(db, s.dependent);
    const second = await db.service().rpc<Record<string, unknown>>("bank_connection_allowance", { p_user: s.dependent });
    expect(second.data).toMatchObject({ allowed: false, reason: "plan_limit_connections" });
    await paid(db, s.guardian);
    const third = await db.service().rpc<Record<string, unknown>>("bank_connection_allowance", { p_user: s.dependent });
    expect(third.data).toMatchObject({ allowed: true, plan: "paid" });
  });

  it("a connection never changes hands", async () => {
    const s = await sharing(db);
    const bank = await connectBank(db, s.dependent);
    const thief = await user(db, "thief");
    const res = await db.service().rpc("bank_upsert_connection", { p_user: thief, p_item: bank.itemId, p_institution: "x", p_status: "active" });
    expect(res.error?.message).toBe("connection_belongs_to_another_account");
  });
});

describe("ingesting entries", () => {
  it("the same entry arriving twice is stored once", async () => {
    const s = await sharingWithBank(db);
    const row = entry();
    expect((await ingest(db, s.checking, [row])).data).toEqual({ inserted: 1, updated: 0 });
    expect((await ingest(db, s.checking, [row])).data).toEqual({ inserted: 0, updated: 0 });
    expect((await ingest(db, s.checking, [row, row])).data).toEqual({ inserted: 0, updated: 0 });
    const n = await db.admin<{ n: number }>("select count(*)::int as n from public.bank_transactions where account_id = $1", [s.checking]);
    expect(n[0].n).toBe(1);
  });

  it("a pending entry that posts is updated in place", async () => {
    const s = await sharingWithBank(db);
    const row = entry({ status: "pending", amount: 5000 });
    await ingest(db, s.checking, [row]);
    expect((await ingest(db, s.checking, [{ ...row, status: "posted", amount: 5200 }])).data).toEqual({ inserted: 0, updated: 1 });
    const rows = await db.admin<Record<string, unknown>>("select status, amount::int as amount from public.bank_transactions where account_id = $1", [s.checking]);
    expect(rows).toEqual([{ status: "posted", amount: 5200 }]);
  });

  it("text is cleaned and capped, and an unknown category becomes Other", async () => {
    const s = await sharingWithBank(db);
    const res = await ingest(db, s.checking, [entry({ description: `  PIX\u0007   ENVIADO\n ${"x".repeat(400)}`, category: "Made up", merchant: "  " })]);
    expect(res.error).toBeNull();
    const rows = await db.admin<{ description: string; category: string; merchant: string | null }>(
      "select description, category, merchant from public.bank_transactions where account_id = $1",
      [s.checking],
    );
    expect(rows[0].description.startsWith("PIX ENVIADO x")).toBe(true);
    expect(rows[0].description.length).toBe(200);
    expect(rows[0].category).toBe("Other");
    expect(rows[0].merchant).toBeNull();
  });

  it("entries the bank withdrew are removed", async () => {
    const s = await sharingWithBank(db);
    const a = entry();
    const b = entry();
    await ingest(db, s.checking, [a, b]);
    const res = await db.service().rpc<number>("bank_delete_transactions", { p_account: s.checking, p_external_ids: [a.external_id] });
    expect(res.data).toBe(1);
    expect((await feed(db, s.guardian, s.dependent)).data?.map((r) => r.description)).toHaveLength(1);
  });
});

describe("what a guardian reads", () => {
  it("the shared account's entries, newest first — and only those", async () => {
    const s = await sharingWithBank(db, { paid: true });
    const old = entry({ description: "Old", date: new Date(Date.now() - 5 * 86_400_000).toISOString() });
    const recent = entry({ description: "Recent" });
    await ingest(db, s.checking, [old, recent]);
    // The card isn't shared yet: nothing of it can be stored or seen.
    const rows = (await feed(db, s.guardian, s.dependent)).data!;
    expect(rows.map((r) => r.description)).toEqual(["Recent", "Old"]);
    expect(rows[0]).toMatchObject({ amount: 2590, direction: "expense", category: "Eating out", currency: "BRL", status: "posted" });
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["account_id", "amount", "category", "currency", "date", "description", "direction", "id", "merchant", "status"].sort(),
    );
  });

  it("filters by period and pages", async () => {
    const s = await sharingWithBank(db);
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    await ingest(db, s.checking, [entry({ description: "d0", date: day(0) }), entry({ description: "d2", date: day(2) }), entry({ description: "d9", date: day(9) })]);
    const week = await feed(db, s.guardian, s.dependent, { p_from: day(7) });
    expect(week.data?.map((r) => r.description)).toEqual(["d0", "d2"]);
    const older = await feed(db, s.guardian, s.dependent, { p_to: day(1) });
    expect(older.data?.map((r) => r.description)).toEqual(["d2", "d9"]);
    const page = await feed(db, s.guardian, s.dependent, { p_limit: 1, p_offset: 1 });
    expect(page.data?.map((r) => r.description)).toEqual(["d2"]);
  });

  it("a stranger, another family's guardian and the dependent's sibling get nothing", async () => {
    const s = await sharingWithBank(db, { paid: true });
    await ingest(db, s.checking, [entry()]);
    const stranger = await user(db, "stranger");
    const other = await sharing(db);
    const sibling = await join(db, s.guardian, s.familyId, "Beto");
    for (const who of [stranger, other.guardian, other.dependent, sibling]) {
      const res = await feed(db, who, s.dependent);
      expect(res.status, who).toBe(403);
      expect(res.error?.message).toBe("no_access");
      expect(res.data).toBeNull();
      expect((await db.as(who).rpc("family_dependent_overview", { p_dependent: s.dependent })).error?.message).toBe("no_access");
      expect((await db.as(who).from("bank_transactions").select("*")).data).toEqual([]);
    }
  });

  it("when the dependent stops sharing, the guardian is refused on the very next read", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry()]);
    expect((await feed(db, s.guardian, s.dependent)).data).toHaveLength(1);
    await db.as(s.dependent).rpc("family_consent_revoke", { p_family: s.familyId });
    const after = await feed(db, s.guardian, s.dependent);
    expect(after.status).toBe(403);
    expect(after.data).toBeNull();
    expect((await db.as(s.guardian).rpc("family_dependent_overview", { p_dependent: s.dependent })).status).toBe(403);
  });

  it("…and when the consent's date passes", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry()]);
    await db.admin("update public.family_consents set expires_at = now() - interval '1 second' where dependent_id = $1", [s.dependent]);
    expect((await feed(db, s.guardian, s.dependent)).status).toBe(403);
  });

  it("free plan: only the first shared account is visible; the second unlocks with the subscription", async () => {
    const s = await sharingWithBank(db, { paid: true });
    await share(db, s.dependent, s.card);
    await db.admin("update public.bank_accounts set shared_at = now() + interval '1 minute' where id = $1", [s.card]);
    await ingest(db, s.checking, [entry({ description: "checking" })]);
    await ingest(db, s.card, [entry({ description: "card" })]);
    expect((await feed(db, s.guardian, s.dependent)).data?.map((r) => r.description).sort()).toEqual(["card", "checking"]);

    await unpaid(db, s.guardian);
    expect((await feed(db, s.guardian, s.dependent)).data?.map((r) => r.description)).toEqual(["checking"]);
    const overview = await db.as(s.guardian).rpc<{ accounts: { kind: string; locked: boolean }[] }>("family_dependent_overview", { p_dependent: s.dependent });
    expect(overview.data?.accounts.map((a) => [a.kind, a.locked])).toEqual([
      ["checking", false],
      ["credit_card", true],
    ]);
  });

  it("the overview names accounts and connection states, with no amounts from the bank", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry({ amount: 777123 })]);
    const overview = await db.as(s.guardian).rpc<Record<string, unknown>>("family_dependent_overview", { p_dependent: s.dependent });
    expect(overview.data).toMatchObject({
      accounts: [{ name: "Conta Corrente", kind: "checking", last4: "4321", institution: "Banco Fictício", locked: false }],
      connections: [{ institution: "Banco Fictício", status: "active" }],
      budgets: [],
    });
    expect(JSON.stringify(overview.data)).not.toContain("777123");
  });
});

describe("the access history", () => {
  it("each read is recorded where the dependent can see it — once per half hour, not per refresh", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry()]);
    await feed(db, s.guardian, s.dependent);
    await feed(db, s.guardian, s.dependent);
    await feed(db, s.guardian, s.dependent, { p_limit: 10 });
    const seen = await db.as(s.dependent).from("family_audit_log").select("action,actor_name,actor_id").eq("action", "viewed_transactions");
    expect(seen.data).toEqual([{ action: "viewed_transactions", actor_name: "Maria", actor_id: s.guardian }]);

    await db.admin("update public.family_audit_log set created_at = now() - interval '31 minutes' where action = 'viewed_transactions' and subject_id = $1", [s.dependent]);
    await feed(db, s.guardian, s.dependent);
    const again = await db.as(s.dependent).from("family_audit_log").select("id").eq("action", "viewed_transactions");
    expect(again.data).toHaveLength(2);
  });

  it("a refused read leaves no trace of having seen anything", async () => {
    const s = await sharingWithBank(db);
    const stranger = await user(db, "stranger");
    await feed(db, stranger, s.dependent);
    const seen = await db.as(s.dependent).from("family_audit_log").select("id").eq("action", "viewed_transactions");
    expect(seen.data).toEqual([]);
  });
});

describe("budgets", () => {
  const set = (viewer: string, familyId: string, dependent: string, category: string, limit: number | null) =>
    db.as(viewer).rpc("family_budget_set", { p_family: familyId, p_dependent: dependent, p_category: category, p_limit: limit });

  it("the guardian sets a monthly limit per category; the dependent can see it", async () => {
    const s = await sharingWithBank(db);
    expect((await set(s.guardian, s.familyId, s.dependent, "Eating out", 30000)).error).toBeNull();
    expect((await set(s.guardian, s.familyId, s.dependent, "total", 150000)).error).toBeNull();
    const mine = await db.as(s.dependent).from("family_budgets").select("category,limit").order("category");
    expect(mine.data).toEqual([
      { category: "Eating out", limit: 30000 },
      { category: "total", limit: 150000 },
    ]);
    const overview = await db.as(s.guardian).rpc<{ budgets: unknown[] }>("family_dependent_overview", { p_dependent: s.dependent });
    expect(overview.data?.budgets).toHaveLength(2);
    // Setting it again replaces it; zero removes it.
    await set(s.guardian, s.familyId, s.dependent, "Eating out", 45000);
    await set(s.guardian, s.familyId, s.dependent, "total", 0);
    expect((await db.as(s.dependent).from("family_budgets").select("category,limit")).data).toEqual([{ category: "Eating out", limit: 45000 }]);
    const log = await db.as(s.dependent).from("family_audit_log").select("action").eq("action", "budget_set");
    expect(log.data).toHaveLength(4);
  });

  it("only for a dependent the guardian may view, in their own family, with a known category", async () => {
    const s = await sharingWithBank(db);
    const other = await sharing(db);
    expect((await set(other.guardian, other.familyId, s.dependent, "Eating out", 100)).error?.message).toBe("no_access");
    expect((await set(other.guardian, s.familyId, s.dependent, "Eating out", 100)).error?.message).toBe("not_a_guardian");
    expect((await set(s.dependent, s.familyId, s.dependent, "Eating out", 100)).error?.message).toBe("not_a_guardian");
    expect((await set(s.guardian, s.familyId, s.dependent, "Made up", 100)).error?.message).toBe("invalid_category");
    expect((await db.as(s.guardian).from("family_budgets").insert({ family_id: s.familyId, guardian_id: s.guardian, dependent_id: s.dependent, category: "total", limit: 1 })).error?.code).toBe("42501");
  });

  it("the guardian stops seeing them when sharing stops; they go when the dependent leaves", async () => {
    const s = await sharingWithBank(db);
    await set(s.guardian, s.familyId, s.dependent, "Groceries", 80000);
    await db.as(s.dependent).rpc("family_consent_revoke", { p_family: s.familyId });
    expect((await db.as(s.guardian).from("family_budgets").select("*")).data).toEqual([]);
    expect((await db.as(s.dependent).from("family_budgets").select("category")).data).toEqual([{ category: "Groceries" }]);
    await db.as(s.dependent).rpc("family_leave", { p_family: s.familyId });
    const left = await db.admin<{ n: number }>("select count(*)::int as n from public.family_budgets where dependent_id = $1", [s.dependent]);
    expect(left[0].n).toBe(0);
  });
});

describe("live signals", () => {
  const signals = async (viewer: string) =>
    ((await db.as(viewer).from("family_sync_signals").select("kind,dependent_id").order("id")).data ?? []) as { kind: string; dependent_id: string }[];

  it("new entries signal the dependent and their guardian, and carry no data", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry({ amount: 424242, description: "Secret" })]);
    const mine = await signals(s.guardian);
    expect(mine.some((x) => x.kind === "transactions" && x.dependent_id === s.dependent)).toBe(true);
    const all = await db.admin<Record<string, unknown>>("select * from public.family_sync_signals where dependent_id = $1", [s.dependent]);
    expect(JSON.stringify(all)).not.toMatch(/424242|Secret/);
    expect(Object.keys(all[0]).sort()).toEqual(["audience_id", "created_at", "dependent_id", "id", "kind"]);
  });

  it("a stranger hears nothing", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry()]);
    const stranger = await user(db, "stranger");
    expect(await signals(stranger)).toEqual([]);
  });

  it("when sharing stops the guardian gets that one signal, and none after it", async () => {
    const s = await sharingWithBank(db);
    // The dependent also shares with a second family, so their entries are
    // still stored (0015 stops storing them once nobody is shared with).
    const other = await family(db);
    const inv = await db.as(other.guardian).rpc<{ code: string }>("family_invite_create", { p_family: other.familyId, p_kind: "adult", p_label: "Ana" });
    const acc = await db
      .as(s.dependent)
      .rpc<{ ok: boolean }>("family_invite_accept", { p_code: inv.data!.code, p_display_name: "Ana", p_term_version: V, p_confirm_adult: true });
    expect(acc.data?.ok).toBe(true);

    await db.as(s.dependent).rpc("family_consent_revoke", { p_family: s.familyId });
    const afterRevoke = await signals(s.guardian);
    expect(afterRevoke.map((x) => x.kind)).toEqual(expect.arrayContaining(["sharing"]));
    const before = afterRevoke.length;
    await ingest(db, s.checking, [entry()]);
    expect(await signals(s.guardian)).toHaveLength(before);
    expect((await signals(s.dependent)).some((x) => x.kind === "transactions")).toBe(true);
  });

  it("the table is in the realtime publication", async () => {
    const rows = await db.admin<{ n: number }>(
      "select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'family_sync_signals'",
    );
    expect(rows[0].n).toBe(1);
  });
});

describe("removing a connection", () => {
  it("takes its accounts and entries with it, and is recorded", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry()]);
    expect((await db.service().rpc("bank_remove_connection", { p_connection: s.bank.connectionId })).error).toBeNull();
    const left = await db.admin<{ n: number }>(
      "select (select count(*) from public.bank_accounts where user_id = $1)::int + (select count(*) from public.bank_transactions where user_id = $1)::int as n",
      [s.dependent],
    );
    expect(left[0].n).toBe(0);
    expect((await feed(db, s.guardian, s.dependent)).data).toEqual([]);
    const log = await db.as(s.dependent).from("family_audit_log").select("action").eq("action", "bank_disconnected");
    expect(log.data).toHaveLength(1);
  });

  it("deleting the account deletes the bank data", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry()]);
    await db.admin("delete from auth.users where id = $1", [s.dependent]);
    const left = await db.admin<{ n: number }>(
      "select (select count(*) from public.bank_connections where user_id = $1)::int + (select count(*) from public.bank_accounts where user_id = $1)::int + (select count(*) from public.bank_transactions where user_id = $1)::int as n",
      [s.dependent],
    );
    expect(left[0].n).toBe(0);
  });
});

describe("a family of one guardian and no bank yet", () => {
  it("reads as empty rather than failing", async () => {
    const f = await family(db);
    const d = await join(db, f.guardian, f.familyId);
    expect((await feed(db, f.guardian, d)).data).toEqual([]);
    const overview = await db.as(f.guardian).rpc<Record<string, unknown[]>>("family_dependent_overview", { p_dependent: d });
    expect(overview.data).toMatchObject({ accounts: [], connections: [], budgets: [] });
  });
});
