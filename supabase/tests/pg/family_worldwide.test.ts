// @vitest-environment node
/**
 * 0016 against a real Postgres: connections from three providers, the tables
 * only the server may touch, amounts compared in one currency, and months in
 * the dependent's own time zone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type TestDb } from "./harness";
import { entry, ingest, paid, share, sharing, user } from "./fixtures";

let db: TestDb;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

let seq = 0;
/** A connection in another country, its accounts in `currency`. */
async function bankIn(userId: string, provider: string, country: string, currency: string) {
  seq += 1;
  const conn = await db.service().rpc<{ connection_id: string }>("bank_upsert_connection", {
    p_user: userId,
    p_item: `ext-${seq}`,
    p_institution: `Test Bank ${country}`,
    p_status: "active",
    p_synced: true,
    p_provider: provider,
    p_country: country,
  });
  expect(conn.error).toBeNull();
  const accounts = await db.service().rpc<{ id: string }[]>("bank_upsert_accounts", {
    p_connection: conn.data!.connection_id,
    p_accounts: [{ external_id: `acc-${seq}`, kind: "checking", name: "Checking", last4: "1234", currency }],
  });
  return { connectionId: conn.data!.connection_id, itemId: `ext-${seq}`, accountId: accounts.data![0].id };
}

describe("providers", () => {
  it("keeps connections from different providers apart, and records the country", async () => {
    const s = await sharing(db, { paid: true });
    const a = await db.service().rpc<{ connection_id: string }>("bank_upsert_connection", {
      p_user: s.dependent, p_item: "same-id", p_institution: "A", p_status: "active", p_provider: "plaid", p_country: "us",
    });
    const b = await db.service().rpc<{ connection_id: string }>("bank_upsert_connection", {
      p_user: s.dependent, p_item: "same-id", p_institution: "B", p_status: "active", p_provider: "saltedge", p_country: "DE",
    });
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data!.connection_id).not.toBe(b.data!.connection_id);
    const rows = await db.admin<{ provider: string; country_code: string }>(
      "select provider, country_code from public.bank_connections where external_item_id = 'same-id' order by provider",
    );
    expect(rows).toEqual([
      { provider: "plaid", country_code: "US" },
      { provider: "saltedge", country_code: "DE" },
    ]);
  });

  it("refuses a provider it doesn't know, and Pluggy stays the default", async () => {
    const s = await sharing(db);
    const bad = await db.service().rpc("bank_upsert_connection", { p_user: s.dependent, p_item: "x", p_institution: "X", p_status: "active", p_provider: "acme" });
    expect(bad.error?.message).toBe("invalid_provider");
    const ok = await db.service().rpc<{ connection_id: string }>("bank_upsert_connection", { p_user: s.dependent, p_item: "legacy", p_institution: "X", p_status: "active" });
    const [row] = await db.admin<{ provider: string }>("select provider from public.bank_connections where id = $1", [ok.data!.connection_id]);
    expect(row.provider).toBe("pluggy");
  });

  it("only the server can touch access tokens, customers and connection windows", async () => {
    const s = await sharing(db);
    const bank = await bankIn(s.dependent, "plaid", "US", "USD");
    await db.admin("insert into public.bank_credentials (connection_id, secret) values ($1, 'v1:ciphertext')", [bank.connectionId]);
    await db.admin("insert into public.bank_customers (user_id, provider, external_customer_id) values ($1, 'saltedge', 'cust-1')", [s.dependent]);
    await db.admin(
      "insert into public.bank_link_sessions (user_id, provider, external_ref, expires_at) values ($1, 'plaid', 'link-1', now() + interval '1 hour')",
      [s.dependent],
    );
    for (const table of ["bank_credentials", "bank_customers", "bank_link_sessions"]) {
      for (const client of [db.as(s.dependent), db.as(s.guardian), db.anon()]) {
        const res = await client.from(table).select("*");
        expect(res.status, table).toBe(403);
      }
      expect((await db.service().from(table).select("*")).error, table).toBeNull();
    }
    // The owner still sees the connection itself, with its provider.
    const own = await db.as(s.dependent).from("bank_connections").select("provider,country_code").eq("id", bank.connectionId).single();
    expect(own.data).toEqual({ provider: "plaid", country_code: "US" });
  });
});

describe("currencies", () => {
  it("a purchase alert compares amounts in its own currency only", async () => {
    const s = await sharing(db);
    const eur = await bankIn(s.dependent, "saltedge", "DE", "EUR");
    expect((await share(db, s.dependent, eur.accountId)).error).toBeNull();
    const rule = await db.as(s.guardian).rpc("family_alert_rule_set", {
      p_family: s.familyId, p_dependent: s.dependent, p_kind: "large_purchase", p_enabled: true, p_threshold: 10000,
    });
    expect(rule.error).toBeNull();
    // The rule took the dependent's main currency.
    const [r] = await db.admin<{ currency: string }>("select currency from public.family_alert_rules where dependent_id = $1 and kind = 'large_purchase'", [s.dependent]);
    expect(r.currency).toBe("EUR");

    await ingest(db, eur.accountId, [entry({ amount: 20000, currency: "EUR" }), entry({ amount: 50000, currency: "USD" })]);
    const events = await db.admin<{ kind: string }>("select kind from public.family_alert_events where dependent_id = $1", [s.dependent]);
    expect(events.map((e) => e.kind)).toEqual(["large_purchase"]);
  });

  it("a budget counts only entries in its currency", async () => {
    const s = await sharing(db, { paid: true });
    const usd = await bankIn(s.dependent, "plaid", "US", "USD");
    await share(db, s.dependent, usd.accountId);
    await db.as(s.guardian).rpc("family_alert_rule_set", { p_family: s.familyId, p_dependent: s.dependent, p_kind: "budget_exceeded", p_enabled: true });
    const set = await db.as(s.guardian).rpc("family_budget_set", { p_family: s.familyId, p_dependent: s.dependent, p_category: "total", p_limit: 10000 });
    expect(set.error).toBeNull();
    const [b] = await db.admin<{ currency: string }>("select currency from public.family_budgets where dependent_id = $1", [s.dependent]);
    expect(b.currency).toBe("USD");

    await ingest(db, usd.accountId, [entry({ amount: 90000, currency: "BRL" })]);
    expect(await db.admin("select 1 from public.family_alert_events where dependent_id = $1 and kind = 'budget_exceeded'", [s.dependent])).toHaveLength(0);
    await ingest(db, usd.accountId, [entry({ amount: 12000, currency: "USD" })]);
    expect(await db.admin("select 1 from public.family_alert_events where dependent_id = $1 and kind = 'budget_exceeded'", [s.dependent])).toHaveLength(1);

    const overview = await db.as(s.guardian).rpc<{ budgets: { currency: string }[]; connections: { provider: string; country: string }[] }>(
      "family_dependent_overview",
      { p_dependent: s.dependent },
    );
    expect(overview.data?.budgets[0].currency).toBe("USD");
    expect(overview.data?.connections[0]).toMatchObject({ provider: "plaid", country: "US" });
  });

  it("refuses a currency that isn't three letters", async () => {
    const s = await sharing(db);
    const res = await db.as(s.guardian).rpc("family_budget_set", { p_family: s.familyId, p_dependent: s.dependent, p_category: "total", p_limit: 100, p_currency: "euro" });
    expect(res.error?.message).toBe("invalid_currency");
  });
});

describe("time zones", () => {
  it("a month starts at the person's own midnight", async () => {
    const [row] = await db.admin<{ tokyo: string; saopaulo: string; london: string }>(
      `select public.family_month_start_in('2026-12-01T00:30:00+09:00', 'Asia/Tokyo') as tokyo,
              public.family_month_start_in('2026-12-01T00:30:00+09:00', 'America/Sao_Paulo') as saopaulo,
              public.family_month_start_in('2026-07-15T12:00:00Z', 'Europe/London') as london`,
    );
    expect(new Date(row.tokyo).toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(new Date(row.saopaulo).toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(new Date(row.london).toISOString()).toBe("2026-06-30T23:00:00.000Z");
  });

  it("the app sets it; nonsense is refused; Brazil's until set", async () => {
    const s = await sharing(db);
    const [before] = await db.admin<{ tz: string }>("select public.family_user_time_zone($1) as tz", [s.dependent]);
    expect(before.tz).toBe("America/Sao_Paulo");
    expect((await db.as(s.dependent).rpc("family_set_time_zone", { p_tz: "Mars/Olympus" })).error?.message).toBe("invalid_time_zone");
    expect((await db.as(s.dependent).rpc("family_set_time_zone", { p_tz: "Europe/Lisbon" })).error).toBeNull();
    const [after] = await db.admin<{ tz: string }>("select public.family_user_time_zone($1) as tz", [s.dependent]);
    expect(after.tz).toBe("Europe/Lisbon");
    // Only through the function: and someone in no family has nothing to set.
    const loner = await user(db, "loner");
    expect((await db.as(loner).rpc("family_set_time_zone", { p_tz: "Asia/Tokyo" })).error).toBeNull();
  });
});

describe("housekeeping", () => {
  it("a connection due to end carries its provider and credential to the server", async () => {
    const s = await sharing(db);
    await paid(db, s.guardian);
    const bank = await bankIn(s.dependent, "plaid", "CA", "CAD");
    await db.admin("insert into public.bank_credentials (connection_id, secret, environment) values ($1, 'v1:sealed', 'sandbox')", [bank.connectionId]);
    await db.as(s.dependent).rpc("family_leave", { p_family: s.familyId });
    await db.admin("update public.bank_connections set orphaned_at = now() - interval '31 days' where id = $1", [bank.connectionId]);
    const res = await db.service().rpc<{ due_connections: Record<string, unknown>[] }>("family_maintenance", { p_force: true, p_limit: 100 });
    expect(res.error).toBeNull();
    expect(res.data!.due_connections.find((d) => d.connection_id === bank.connectionId)).toMatchObject({
      provider: "plaid",
      external_item_id: bank.itemId,
      credential: "v1:sealed",
      environment: "sandbox",
    });
  });
});
