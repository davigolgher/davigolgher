// @vitest-environment node
/**
 * Banks in Flow itself (0017): a subscriber connects their own bank and the
 * purchases become their own expenses — categorised, corrected when the bank
 * corrects them, removed when the bank withdraws them, and theirs to keep
 * when they disconnect. Run against the real migrations, as each role.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type TestDb } from "./harness";
import { connectBank, entry, ingest, paid, share, sharing, user, type Bank } from "./fixtures";

let db: TestDb;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

interface FlowRow {
  id: string;
  amount: number;
  direction: string;
  description: string;
  category: string;
  merchant: string | null;
  currency: string;
  source: string;
  bank_transaction_id: string | null;
}

const flow = async (userId: string) =>
  ((await db.as(userId).from("transactions").select("id,amount,direction,description,category,merchant,currency,source,bank_transaction_id").order("date")).data ??
    []) as FlowRow[];

/** A subscriber with a bank connected and every BRL account imported. */
async function subscriberWithBank(): Promise<{ me: string; bank: Bank }> {
  const me = await user(db, "subscriber");
  await paid(db, me);
  const bank = await connectBank(db, me);
  const res = await db.as(me).rpc<{ imported_accounts: number; other_accounts: number }>("bank_connection_import_defaults", {
    p_connection: bank.connectionId,
    p_currency: "BRL",
  });
  expect(res.error).toBeNull();
  expect(res.data).toEqual({ imported_accounts: 2, other_accounts: 0 });
  return { me, bank };
}

describe("importing into my Flow", () => {
  it("purchases become my expenses, in the bank's category, with the category added to mine", async () => {
    const { me, bank } = await subscriberWithBank();
    const rows = [
      entry({ merchant: "Supermercado Central", description: "SUPERMERCADO CENTRAL 123", category: "Groceries", amount: 18740 }),
      entry({ merchant: undefined, description: "SALARIO EMPRESA", category: "Income", direction: "income", amount: 450000 }),
      entry({ merchant: undefined, description: "PAGAMENTO FATURA", category: "Internal", amount: 120000 }),
    ];
    expect((await ingest(db, bank.accounts[0].id, rows)).error).toBeNull();

    const mine = await flow(me);
    expect(mine.map((t) => [t.description, t.category, t.direction, t.amount, t.source])).toEqual([
      ["Supermercado Central", "Groceries", "expense", 18740, "bank"],
      ["SALARIO EMPRESA", "Income", "income", 450000, "bank"],
    ]);
    // Paying the card bill from the checking account is not spending: with
    // both accounts connected it would count the same money twice.
    expect(mine.some((t) => t.description.includes("FATURA"))).toBe(false);

    const cats = (((await db.as(me).from("categories").select("label")).data ?? []) as { label: string }[]).map((c) => c.label).sort();
    expect(cats).toEqual(["Groceries", "Income"]);
  });

  it("the bank's corrections reach the expense; my own edits stay", async () => {
    const { me, bank } = await subscriberWithBank();
    const pending = entry({ status: "pending", amount: 5000, category: "Eating out" });
    await ingest(db, bank.accounts[1].id, [pending]);
    const [copy] = await flow(me);
    expect((await db.as(me).from("transactions").update({ category: "Dates", note: "anniversary" }).eq("id", copy.id)).error).toBeNull();

    await ingest(db, bank.accounts[1].id, [{ ...pending, status: "posted", amount: 5450 }]);
    const [after] = (await db.as(me).from("transactions").select("amount,category,note").eq("id", copy.id)).data as {
      amount: number;
      category: string;
      note: string;
    }[];
    expect(after).toEqual({ amount: 5450, category: "Dates", note: "anniversary" });
  });

  it("an entry the bank withdraws leaves my Flow; one I deleted never comes back", async () => {
    const { me, bank } = await subscriberWithBank();
    const a = entry();
    const b = entry();
    await ingest(db, bank.accounts[0].id, [a, b]);
    expect(await flow(me)).toHaveLength(2);

    await db.service().rpc("bank_delete_transactions", { p_account: bank.accounts[0].id, p_external_ids: [a.external_id] });
    expect(await flow(me)).toHaveLength(1);

    const [left] = await flow(me);
    expect((await db.as(me).from("transactions").delete().eq("id", left.id)).error).toBeNull();
    await ingest(db, bank.accounts[0].id, [{ ...b, amount: b.amount + 1 }]);
    expect(await flow(me)).toHaveLength(0);
  });

  it("only accounts in my Flow currency are switched on for me; the rest wait for my choice", async () => {
    const me = await user(db, "traveller");
    await paid(db, me);
    const conn = await db.service().rpc<{ connection_id: string }>("bank_upsert_connection", {
      p_user: me, p_item: "item-multi", p_institution: "Bank", p_status: "active", p_provider: "plaid", p_country: "US",
    });
    await db.service().rpc("bank_upsert_accounts", {
      p_connection: conn.data!.connection_id,
      p_accounts: [
        { external_id: "usd", kind: "checking", name: "Checking", currency: "USD" },
        { external_id: "eur", kind: "savings", name: "Euro savings", currency: "EUR" },
      ],
    });
    const res = await db.as(me).rpc("bank_connection_import_defaults", { p_connection: conn.data!.connection_id, p_currency: "usd" });
    expect(res.data).toEqual({ imported_accounts: 1, other_accounts: 1 });
  });

  it("turning an account off keeps what was imported and stops new entries; on again brings them in", async () => {
    const { me, bank } = await subscriberWithBank();
    const card = bank.accounts[1].id;
    await ingest(db, card, [entry()]);
    expect((await db.as(me).rpc("bank_account_set_import", { p_account: card, p_import: false })).data).toEqual({ import: false, imported: 0 });
    expect(await flow(me)).toHaveLength(1);
    // Read for nothing any more: the bank's copy goes, my expense stays.
    expect(await db.admin("select 1 from public.bank_transactions where account_id = $1", [card])).toHaveLength(0);

    // Still read (the checking account keeps the connection in use), but the
    // card is no longer read, so its entries are refused rather than stored.
    expect((await ingest(db, card, [entry()])).error?.message).toBe("account_not_shared");

    // Shared with nobody and imported nowhere: nothing to bring back. Share it
    // with nobody, switch it on: what the bank still holds is brought in.
    const on = await db.as(me).rpc<{ imported: number }>("bank_account_set_import", { p_account: card, p_import: true });
    expect(on.data).toEqual({ import: true, imported: 0 });
    await ingest(db, card, [entry(), entry()]);
    expect(await flow(me)).toHaveLength(3);
  });
});

describe("disconnecting", () => {
  it("keeps what was imported by default, as my own records", async () => {
    const { me, bank } = await subscriberWithBank();
    await ingest(db, bank.accounts[0].id, [entry(), entry()]);
    expect((await db.service().rpc("bank_remove_connection", { p_connection: bank.connectionId })).error).toBeNull();
    const mine = await flow(me);
    expect(mine).toHaveLength(2);
    expect(mine.every((t) => t.bank_transaction_id === null && t.source === "bank")).toBe(true);
    expect((await db.admin("select 1 from public.bank_transactions where user_id = $1", [me])).length).toBe(0);
  });

  it("or deletes it, when I ask", async () => {
    const { me, bank } = await subscriberWithBank();
    await ingest(db, bank.accounts[0].id, [entry(), entry()]);
    const res = await db.service().rpc("bank_remove_connection", { p_connection: bank.connectionId, p_keep_imported: false });
    expect(res.error).toBeNull();
    expect(await flow(me)).toHaveLength(0);
  });
});

describe("keeping a connection alive", () => {
  it("a connection used only for my own Flow is in use: maintenance doesn't end it", async () => {
    const { me, bank } = await subscriberWithBank();
    await db.service().rpc("family_maintenance", { p_force: true });
    const [conn] = await db.admin<{ orphaned_at: string | null }>("select orphaned_at from public.bank_connections where id = $1", [bank.connectionId]);
    expect(conn.orphaned_at).toBeNull();

    // Nothing imported and nothing shared: then it is unused, as before.
    for (const a of bank.accounts) await db.as(me).rpc("bank_account_set_import", { p_account: a.id, p_import: false });
    const [after] = await db.admin<{ orphaned_at: string | null }>("select orphaned_at from public.bank_connections where id = $1", [bank.connectionId]);
    expect(after.orphaned_at).not.toBeNull();
  });

  it("the bank's copy ages out after 13 months; my imported expense stays", async () => {
    const { me, bank } = await subscriberWithBank();
    const old = new Date(Date.now() - 14 * 30 * 86_400_000).toISOString();
    await ingest(db, bank.accounts[0].id, [entry({ date: old })]);
    await db.service().rpc("family_maintenance", { p_force: true });
    expect((await db.admin("select 1 from public.bank_transactions where user_id = $1", [me])).length).toBe(0);
    expect(await flow(me)).toHaveLength(1);
  });

  it("sharing with a family and importing at once: stopping either keeps the other going", async () => {
    const s = await sharing(db);
    await paid(db, s.dependent);
    const bank = await connectBank(db, s.dependent);
    const checking = bank.accounts[0].id;
    await share(db, s.dependent, checking);
    await db.as(s.dependent).rpc("bank_account_set_import", { p_account: checking, p_import: true });
    await ingest(db, checking, [entry(), entry()]);
    expect(await flow(s.dependent)).toHaveLength(2);

    // Stop sharing: still imported, so nothing is deleted and reading goes on.
    expect((await share(db, s.dependent, checking, false)).error).toBeNull();
    expect(await flow(s.dependent)).toHaveLength(2);
    expect((await ingest(db, checking, [entry()])).error).toBeNull();
    expect(await flow(s.dependent)).toHaveLength(3);
  });

  it("a dependent who only shares with a family keeps today's rules: nothing lands in their Flow", async () => {
    const s = await sharing(db);
    const bank = await connectBank(db, s.dependent);
    await share(db, s.dependent, bank.accounts[0].id);
    await ingest(db, bank.accounts[0].id, [entry()]);
    expect(await flow(s.dependent)).toHaveLength(0);
  });
});

describe("who can touch it", () => {
  it("only the owner switches an account, and the app can't write bank data or call the server's functions", async () => {
    const { bank } = await subscriberWithBank();
    const other = await user(db, "other");
    expect((await db.as(other).rpc("bank_account_set_import", { p_account: bank.accounts[0].id, p_import: false })).error?.message).toBe(
      "account_not_found",
    );
    expect((await db.as(other).rpc("bank_connection_import_defaults", { p_connection: bank.connectionId, p_currency: "BRL" })).error?.message).toBe(
      "connection_not_found",
    );
    expect((await db.anon().rpc("bank_account_set_import", { p_account: bank.accounts[0].id, p_import: true })).error?.code).toBe("42501");
    for (const [fn, args] of [
      ["bank_remove_connection", { p_connection: bank.connectionId, p_keep_imported: false }],
      ["bank_ingest_transactions", { p_account: bank.accounts[0].id, p_rows: [] }],
      ["bank_connection_allowance", { p_user: other }],
    ] as const) {
      expect((await db.as(other).rpc(fn, args)).error?.code, fn).toBe("42501");
    }
  });

  it("someone else never sees my imported expenses", async () => {
    const { bank } = await subscriberWithBank();
    await ingest(db, bank.accounts[0].id, [entry()]);
    const other = await user(db, "other");
    expect(await flow(other)).toHaveLength(0);
  });
});
