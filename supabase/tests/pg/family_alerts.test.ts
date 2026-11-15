// @vitest-environment node
/**
 * 0014 against a real Postgres: alert rules, the alerts they create, push
 * tokens and delivery bookkeeping.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type TestDb } from "./harness";
import { entry, ingest, paid, sharing, sharingWithBank, unpaid, user, V } from "./fixtures";

let db: TestDb;

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

const rule = (viewer: string, familyId: string, dependent: string, kind: string, enabled: boolean, extra: Record<string, unknown> = {}) =>
  db.as(viewer).rpc("family_alert_rule_set", {
    p_family: familyId,
    p_dependent: dependent,
    p_kind: kind,
    p_enabled: enabled,
    ...extra,
  });

type Alert = { kind: string; dependent_id: string; detail: Record<string, unknown>; push_status: string; transaction_id: string | null };

const alerts = async (viewer: string) =>
  ((await db.as(viewer).from("family_alert_events").select("kind,dependent_id,detail,push_status,transaction_id").order("created_at")).data ??
    []) as Alert[];

describe("rules", () => {
  it("sharing starts with the connection alert on", async () => {
    const s = await sharing(db);
    const rules = await db.as(s.guardian).from("family_alert_rules").select("kind,enabled");
    expect(rules.data).toEqual([{ kind: "connection_expired", enabled: true }]);
  });

  it("free plan: large purchase and connection; paid: also category and budget", async () => {
    const s = await sharing(db);
    expect((await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 10000 })).error).toBeNull();
    const cat = await rule(s.guardian, s.familyId, s.dependent, "sensitive_category", true);
    expect(cat.status).toBe(402);
    expect(cat.error?.message).toBe("plan_limit_alerts");
    expect((await rule(s.guardian, s.familyId, s.dependent, "budget_exceeded", true)).error?.message).toBe("plan_limit_alerts");
    // Turning one off is always allowed.
    expect((await rule(s.guardian, s.familyId, s.dependent, "budget_exceeded", false)).error).toBeNull();
    await paid(db, s.guardian);
    expect((await rule(s.guardian, s.familyId, s.dependent, "sensitive_category", true)).error).toBeNull();
    expect((await rule(s.guardian, s.familyId, s.dependent, "budget_exceeded", true)).error).toBeNull();
  });

  it("refuses a large-purchase rule without an amount, and unknown categories", async () => {
    const s = await sharing(db, { paid: true });
    expect((await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true)).error?.message).toBe("invalid_amount");
    expect((await rule(s.guardian, s.familyId, s.dependent, "sensitive_category", true, { p_categories: ["Crypto"] })).error?.message).toBe(
      "invalid_category",
    );
  });

  it("only the dependent's guardian sets rules; the dependent can read them", async () => {
    const s = await sharing(db, { paid: true });
    const stranger = await user(db, "stranger");
    expect((await rule(stranger, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 1 })).error?.message).toBe("not_a_guardian");
    expect((await rule(s.dependent, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 1 })).error?.message).toBe("not_a_guardian");
    await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 5000 });
    const visible = await db.as(s.dependent).from("family_alert_rules").select("kind,threshold").order("kind");
    expect(visible.data).toEqual([
      { kind: "connection_expired", threshold: null },
      { kind: "large_purchase", threshold: 5000 },
    ]);
    expect((await db.as(stranger).from("family_alert_rules").select("*")).data).toEqual([]);
    expect((await db.as(s.guardian).from("family_alert_rules").insert({ family_id: s.familyId, guardian_id: s.guardian, dependent_id: s.dependent, kind: "large_purchase" })).error?.code).toBe(
      "42501",
    );
  });
});

describe("alerts from new entries", () => {
  it("a purchase at or above the amount alerts once, however often it arrives", async () => {
    const s = await sharingWithBank(db);
    await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 10000 });
    const big = entry({ amount: 10000, description: "Loja" });
    await ingest(db, s.checking, [entry({ amount: 9999 }), big, entry({ amount: 50000, direction: "income" })]);
    await ingest(db, s.checking, [big]);
    const got = await alerts(s.guardian);
    expect(got.map((a) => [a.kind, a.detail.threshold])).toEqual([["large_purchase", 10000]]);
    expect(got[0].push_status).toBe("pending");
    // The dependent sees that this alert exists about them.
    expect((await alerts(s.dependent)).map((a) => a.kind)).toEqual(["large_purchase"]);
  });

  it("old entries never alert — connecting a bank doesn't replay its history", async () => {
    const s = await sharingWithBank(db);
    await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 100 });
    await ingest(db, s.checking, [entry({ amount: 999999, date: new Date(Date.now() - 4 * 86_400_000).toISOString() })]);
    expect(await alerts(s.guardian)).toEqual([]);
  });

  it("betting, on the paid plan, by default; other categories when chosen", async () => {
    const s = await sharingWithBank(db, { paid: true });
    await rule(s.guardian, s.familyId, s.dependent, "sensitive_category", true);
    await ingest(db, s.checking, [entry({ category: "Betting & lotteries", amount: 500 }), entry({ category: "Groceries" })]);
    expect((await alerts(s.guardian)).map((a) => a.detail.category)).toEqual(["Betting & lotteries"]);

    await rule(s.guardian, s.familyId, s.dependent, "sensitive_category", true, { p_categories: ["Groceries"] });
    await ingest(db, s.checking, [entry({ category: "Groceries" }), entry({ category: "Betting & lotteries" })]);
    expect((await alerts(s.guardian)).map((a) => a.detail.category)).toEqual(["Betting & lotteries", "Groceries"]);
  });

  it("the category alert stops if the subscription lapses", async () => {
    const s = await sharingWithBank(db, { paid: true });
    await rule(s.guardian, s.familyId, s.dependent, "sensitive_category", true);
    await unpaid(db, s.guardian);
    await ingest(db, s.checking, [entry({ category: "Betting & lotteries" })]);
    expect(await alerts(s.guardian)).toEqual([]);
  });

  it("a budget passed this month alerts once for the month", async () => {
    const s = await sharingWithBank(db, { paid: true });
    await rule(s.guardian, s.familyId, s.dependent, "budget_exceeded", true);
    await db.as(s.guardian).rpc("family_budget_set", { p_family: s.familyId, p_dependent: s.dependent, p_category: "Eating out", p_limit: 5000 });
    await ingest(db, s.checking, [entry({ amount: 3000 })]);
    expect(await alerts(s.guardian)).toEqual([]);
    await ingest(db, s.checking, [entry({ amount: 3000 })]);
    await ingest(db, s.checking, [entry({ amount: 3000 })]);
    const got = await alerts(s.guardian);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ kind: "budget_exceeded", detail: { category: "Eating out", limit: 5000 } });
  });

  it("nothing alerts a guardian who can no longer view the dependent", async () => {
    const s = await sharingWithBank(db);
    await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 100 });
    await db.as(s.dependent).rpc("family_consent_revoke", { p_family: s.familyId });
    await ingest(db, s.checking, [entry({ amount: 5000 })]);
    const rows = await db.admin<{ n: number }>("select count(*)::int as n from public.family_alert_events where dependent_id = $1", [s.dependent]);
    expect(rows[0].n).toBe(0);
  });
});

describe("connection alerts", () => {
  const setStatus = (userId: string, item: string, status: string) =>
    db.service().rpc("bank_upsert_connection", { p_user: userId, p_item: item, p_institution: "Banco Fictício", p_status: status });

  it("a shared connection that stops working alerts the guardian once a day", async () => {
    const s = await sharingWithBank(db);
    await setStatus(s.dependent, s.bank.itemId, "expired");
    await setStatus(s.dependent, s.bank.itemId, "active");
    await setStatus(s.dependent, s.bank.itemId, "expired");
    const got = await alerts(s.guardian);
    expect(got.map((a) => [a.kind, a.detail.status])).toEqual([["connection_expired", "expired"]]);
  });

  it("not for a connection with nothing shared", async () => {
    const s = await sharingWithBank(db);
    await db.as(s.dependent).rpc("bank_account_set_shared", { p_account: s.checking, p_shared: false });
    await setStatus(s.dependent, s.bank.itemId, "needs_attention");
    expect(await alerts(s.guardian)).toEqual([]);
  });
});

describe("when sharing stops", () => {
  it("the guardian's alerts about the dependent are deleted, not just hidden", async () => {
    const s = await sharingWithBank(db);
    await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 100 });
    await ingest(db, s.checking, [entry({ amount: 5000 })]);
    expect(await alerts(s.guardian)).toHaveLength(1);
    await db.as(s.dependent).rpc("family_consent_revoke", { p_family: s.familyId });
    const rows = await db.admin<{ n: number }>("select count(*)::int as n from public.family_alert_events where guardian_id = $1", [s.guardian]);
    expect(rows[0].n).toBe(0);
  });

  it("a renewal keeps them", async () => {
    const s = await sharingWithBank(db);
    await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 100 });
    await ingest(db, s.checking, [entry({ amount: 5000 })]);
    const res = await db.as(s.dependent).rpc("family_consent_renew", { p_family: s.familyId, p_term_version: V, p_months: 12, p_confirm_adult: true });
    expect(res.error).toBeNull();
    expect(await alerts(s.guardian)).toHaveLength(1);
  });

  it("leaving the family removes the rules as well", async () => {
    const s = await sharingWithBank(db);
    await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 100 });
    await db.as(s.dependent).rpc("family_leave", { p_family: s.familyId });
    const rows = await db.admin<{ n: number }>("select count(*)::int as n from public.family_alert_rules where dependent_id = $1", [s.dependent]);
    expect(rows[0].n).toBe(0);
  });
});

describe("reading alerts", () => {
  it("the guardian marks their own as read; nobody else's", async () => {
    const s = await sharingWithBank(db);
    await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 100 });
    await ingest(db, s.checking, [entry({ amount: 5000 })]);
    const ids = (await db.as(s.guardian).from("family_alert_events").select("id")).data as { id: string }[];
    const stranger = await user(db, "stranger");
    await db.as(stranger).rpc("family_alerts_mark_read", { p_ids: ids.map((r) => r.id) });
    await db.as(s.dependent).rpc("family_alerts_mark_read", { p_ids: ids.map((r) => r.id) });
    let read = await db.admin<{ read: boolean }>("select read_at is not null as read from public.family_alert_events where id = $1", [ids[0].id]);
    expect(read[0].read).toBe(false);
    await db.as(s.guardian).rpc("family_alerts_mark_read", { p_ids: ids.map((r) => r.id) });
    read = await db.admin<{ read: boolean }>("select read_at is not null as read from public.family_alert_events where id = $1", [ids[0].id]);
    expect(read[0].read).toBe(true);
  });
});

describe("push tokens and delivery", () => {
  const TOKEN = (n: number) => `ExponentPushToken[test-${n}-abcdef]`;

  it("a token belongs to whoever is signed in on that phone", async () => {
    const a = await user(db, "a");
    const b = await user(db, "b");
    expect((await db.as(a).rpc("push_token_register", { p_token: TOKEN(1), p_platform: "ios" })).error).toBeNull();
    expect((await db.as(b).rpc("push_token_register", { p_token: TOKEN(1), p_platform: "ios" })).error).toBeNull();
    const rows = await db.admin<{ user_id: string }>("select user_id from public.push_tokens where token = $1", [TOKEN(1)]);
    expect(rows).toEqual([{ user_id: b }]);
    expect((await db.as(a).from("push_tokens").select("*")).error?.code).toBe("42501");
  });

  it("refuses anything that isn't an Expo push token", async () => {
    const a = await user(db, "a");
    expect((await db.as(a).rpc("push_token_register", { p_token: "https://evil.example/hook", p_platform: "ios" })).error?.message).toBe("invalid_token");
    expect((await db.as(a).rpc("push_token_register", { p_token: TOKEN(2), p_platform: "web" })).error?.message).toBe("invalid_platform");
  });

  it("signing out removes only one's own token", async () => {
    const a = await user(db, "a");
    const b = await user(db, "b");
    await db.as(a).rpc("push_token_register", { p_token: TOKEN(3), p_platform: "android" });
    await db.as(b).rpc("push_token_remove", { p_token: TOKEN(3) });
    expect(await db.admin("select 1 from public.push_tokens where token = $1", [TOKEN(3)])).toHaveLength(1);
    await db.as(a).rpc("push_token_remove", { p_token: TOKEN(3) });
    expect(await db.admin("select 1 from public.push_tokens where token = $1", [TOKEN(3)])).toHaveLength(0);
  });

  it("claims each alert once, with only the kind and the dependent's name", async () => {
    const s = await sharingWithBank(db);
    await db.as(s.guardian).rpc("push_token_register", { p_token: TOKEN(10), p_platform: "ios" });
    await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 100 });
    await ingest(db, s.checking, [entry({ amount: 123456, description: "Joalheria" })]);

    const first = await db.service().rpc<Record<string, unknown>[]>("family_push_claim", { p_limit: 50 });
    const mine = first.data!.filter((r) => r.guardian_id === s.guardian);
    expect(mine).toEqual([
      { event_id: expect.any(String), guardian_id: s.guardian, kind: "large_purchase", dependent_name: "Ana", tokens: [TOKEN(10)] },
    ]);
    expect(JSON.stringify(mine)).not.toMatch(/123456|Joalheria/);
    const second = await db.service().rpc<Record<string, unknown>[]>("family_push_claim", { p_limit: 50 });
    expect(second.data!.filter((r) => r.guardian_id === s.guardian)).toEqual([]);

    await db.service().rpc("family_push_finish", { p_sent: [mine[0].event_id], p_failed: [], p_dead_tokens: [TOKEN(10)] });
    const ev = await db.admin<{ push_status: string }>("select push_status from public.family_alert_events where id = $1", [mine[0].event_id]);
    expect(ev[0].push_status).toBe("sent");
    expect(await db.admin("select 1 from public.push_tokens where token = $1", [TOKEN(10)])).toHaveLength(0);
  });

  it("skips alerts for a guardian with no device, or who lost access before delivery", async () => {
    const s = await sharingWithBank(db);
    await rule(s.guardian, s.familyId, s.dependent, "large_purchase", true, { p_threshold: 100 });
    await ingest(db, s.checking, [entry({ amount: 5000 })]);
    await db.service().rpc("family_push_claim", { p_limit: 50 });
    const ev = await db.admin<{ push_status: string }>("select push_status from public.family_alert_events where guardian_id = $1", [s.guardian]);
    expect(ev.map((e) => e.push_status)).toEqual(["skipped"]);
  });

  it("delivery functions are for the server only", async () => {
    const a = await user(db, "a");
    expect((await db.as(a).rpc("family_push_claim", { p_limit: 5 })).error?.code).toBe("42501");
    expect((await db.as(a).rpc("family_push_finish", { p_sent: [], p_failed: [] })).error?.code).toBe("42501");
  });
});
