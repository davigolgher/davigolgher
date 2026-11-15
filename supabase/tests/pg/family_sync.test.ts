// @vitest-environment node
/**
 * The bank functions end to end, against a real Postgres (0011–0014) and a
 * fake Pluggy: connecting, reading, the webhook, push, disconnecting and
 * deleting an account. Pluggy and Expo are simulated in memory: no request
 * leaves the machine, and every person and bank here is fictitious.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Env, MakeClient } from "../../functions/_shared/http";
import type { Fetch, PluggyAccount, PluggyItem, PluggyTransaction } from "../../functions/_shared/pluggy";
import { handle as connectToken } from "../../functions/bank-connect-token/index";
import { handle as syncFn } from "../../functions/bank-connection-sync/index";
import { handle as deleteConnection } from "../../functions/bank-connection-delete/index";
import { handle as webhook, SECRET_HEADER } from "../../functions/pluggy-webhook/index";
import { handle as deleteAccount } from "../../functions/delete-account/index";
import { createDb, type TestDb } from "./harness";
import { feed, paid, share, sharing, user } from "./fixtures";

let db: TestDb;

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

const PASSWORD = "correct horse battery";
const ENV: Env = {
  url: "https://flow.test",
  anon: "anon-key",
  service: "service-key",
  pluggyClientId: "client-id",
  pluggyClientSecret: "client-secret-never-leaves-the-server",
  pluggyBaseUrl: "https://api.pluggy.test",
  webhookSecret: "whsec-fictitious-0123456789",
  expoAccessToken: "",
  pluggyIncludeSandbox: true,
  pluggyOauthRedirectUri: "",
};

/* ── a fake Pluggy ─────────────────────────────────────────────────────────── */

type StoredTxn = PluggyTransaction & { createdAt: string };

// Shared by every FakePluggy: the database outlives each test, so ids must too.
let pluggySeq = 0;

class FakePluggy {
  items = new Map<string, PluggyItem>();
  accounts = new Map<string, PluggyAccount[]>();
  txns = new Map<string, StoredTxn[]>();
  calls: { method: string; host: string; path: string; query: URLSearchParams; body?: Record<string, unknown> }[] = [];
  down = false;
  pageSize = 2;

  /** A connection as the widget would leave it, made for `clientUserId`. */
  connect(clientUserId: string, over: Partial<PluggyItem> = {}) {
    pluggySeq += 1;
    const id = `pluggy-item-${pluggySeq}`;
    this.items.set(id, {
      id,
      status: "UPDATED",
      clientUserId,
      connector: { id: 2, name: "Pluggy Bank (sandbox)", isOpenFinance: true },
      consentExpiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      ...over,
    });
    this.accounts.set(id, [
      { id: `${id}-acc-checking`, itemId: id, type: "BANK", subtype: "CHECKING_ACCOUNT", number: "0001/12345-6", name: "Conta Corrente", currencyCode: "BRL" },
      { id: `${id}-acc-card`, itemId: id, type: "CREDIT", subtype: "CREDIT_CARD", number: "xxxx 9876", name: "Cartão Platinum", currencyCode: "BRL" },
    ]);
    return id;
  }

  addTxn(accountId: string, over: Partial<StoredTxn> = {}): StoredTxn {
    pluggySeq += 1;
    const t: StoredTxn = {
      id: `ptx-${pluggySeq}`,
      accountId,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      description: "PADARIA ESTRELA",
      type: "DEBIT",
      amount: -25.9,
      currencyCode: "BRL",
      category: "Bakery",
      status: "POSTED",
      ...over,
    };
    this.txns.set(accountId, [...(this.txns.get(accountId) ?? []), t]);
    return t;
  }

  fetch: Fetch = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({ method, host: url.host, path: url.pathname, query: url.searchParams, body });
    if (this.down) return Response.json({ message: "Service unavailable" }, { status: 503 });
    if (url.pathname === "/auth") {
      return body?.clientSecret === ENV.pluggyClientSecret
        ? Response.json({ apiKey: "api-key-1" })
        : Response.json({ message: "Invalid credentials" }, { status: 401 });
    }
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (headers["X-API-KEY"] !== "api-key-1") return Response.json({ message: "Unauthorized" }, { status: 401 });

    const [, first, second] = url.pathname.split("/");
    if (first === "connect_token") return Response.json({ accessToken: `connect-token-for-${body?.options?.clientUserId}` });
    if (first === "items") {
      const item = this.items.get(decodeURIComponent(second));
      if (!item) return Response.json({ message: "Item not found" }, { status: 404 });
      if (method === "DELETE") {
        this.items.delete(item.id);
        return new Response(null, { status: 204 });
      }
      return Response.json(item);
    }
    if (first === "accounts") return Response.json({ results: this.accounts.get(url.searchParams.get("itemId") ?? "") ?? [] });
    if (first === "v2" && second === "transactions") {
      const q = url.searchParams;
      let list = this.txns.get(q.get("accountId") ?? "") ?? [];
      if (q.get("dateFrom")) list = list.filter((t) => t.date.slice(0, 10) >= q.get("dateFrom")!);
      if (q.get("createdAtFrom")) list = list.filter((t) => t.createdAt >= q.get("createdAtFrom")!);
      if (q.get("ids")) list = list.filter((t) => q.get("ids")!.split(",").includes(t.id));
      const start = Number(q.get("after") ?? 0);
      const page = list.slice(start, start + this.pageSize);
      const more = start + this.pageSize < list.length;
      // A `next` that points elsewhere: only its cursor may be used.
      return Response.json({ results: page, next: more ? `https://elsewhere.test/v2/transactions?after=${start + this.pageSize}` : null });
    }
    return Response.json({ message: "Not found" }, { status: 404 });
  };
}

/* ── a fake Expo push service ──────────────────────────────────────────────── */

class FakeExpo {
  sent: { to: string; title: string; body: string; data: Record<string, unknown> }[] = [];
  gone = new Set<string>();
  down = false;
  fetch: Fetch = async (_input, init) => {
    if (this.down) return new Response("unavailable", { status: 503 });
    const messages = JSON.parse(String(init?.body)) as FakeExpo["sent"];
    return Response.json({
      data: messages.map((m) => {
        if (this.gone.has(m.to)) return { status: "error", details: { error: "DeviceNotRegistered" } };
        this.sent.push(m);
        return { status: "ok", id: `ticket-${this.sent.length}` };
      }),
    });
  };
}

let pluggy: FakePluggy;
let expo: FakeExpo;
beforeEach(() => {
  pluggy = new FakePluggy();
  expo = new FakeExpo();
});

/* ── Supabase clients for the functions, backed by the test database ──────── */

const make: MakeClient = (_url, key, options) => {
  if (key === ENV.service) {
    const s = db.service();
    return {
      from: (t: string) => s.from(t),
      rpc: (f: string, a?: Record<string, unknown>) => s.rpc(f, a),
      auth: {
        admin: {
          async deleteUser(id: string) {
            await db.admin("delete from auth.users where id = $1", [id]);
            return { error: null };
          },
        },
      },
      storage: { from: () => ({ list: async () => ({ data: [] }), remove: async () => ({}) }) },
    };
  }
  const token = String(options?.global?.headers?.Authorization ?? "").replace(/^Bearer /, "");
  const uid = token.startsWith("jwt:") ? token.slice(4) : null;
  const c = uid ? db.as(uid) : db.anon();
  return {
    from: (t: string) => c.from(t),
    rpc: (f: string, a?: Record<string, unknown>) => c.rpc(f, a),
    auth: {
      async getUser() {
        if (!uid) return { data: { user: null }, error: { message: "invalid JWT" } };
        const [row] = await db.admin<{ email: string }>("select email from auth.users where id = $1", [uid]);
        return row ? { data: { user: { id: uid, email: row.email } }, error: null } : { data: { user: null }, error: { message: "no user" } };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const [row] = await db.admin<{ id: string }>("select id from auth.users where email = $1", [email]);
        return row && password === PASSWORD ? { data: { user: { id: row.id } }, error: null } : { data: { user: null }, error: { message: "Invalid login" } };
      },
      async signOut() {
        return { error: null };
      },
    },
  };
};

function req(path: string, body: unknown, opts: { as?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...opts.headers };
  if (opts.as) headers.Authorization = `Bearer jwt:${opts.as}`;
  return new Request(`https://flow.test/functions/v1/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

async function call(res: Promise<Response>) {
  const r = await res;
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

const tokenFor = (as: string | undefined, body: unknown = {}, env = ENV) => call(connectToken(req("bank-connect-token", body, { as }), env, make, pluggy.fetch));
const sync = (as: string, itemId: string) => call(syncFn(req("bank-connection-sync", { itemId }, { as }), ENV, make, pluggy.fetch, expo.fetch));
const disconnect = (as: string, connectionId: string) => call(deleteConnection(req("bank-connection-delete", { connectionId }, { as }), ENV, make, pluggy.fetch));
let eventSeq = 0;
const hook = (payload: Record<string, unknown>, secret: string | null = ENV.webhookSecret, env = ENV) =>
  call(
    webhook(
      req("pluggy-webhook", { eventId: `evt-${++eventSeq}`, ...payload }, { headers: secret === null ? {} : { [SECRET_HEADER]: secret } }),
      env,
      make,
      pluggy.fetch,
      expo.fetch,
    ),
  );

const connectionOf = async (itemId: string) =>
  (await db.admin<{ id: string; user_id: string; status: string; status_detail: string | null; institution_name: string }>(
    "select id, user_id, status, status_detail, institution_name from public.bank_connections where external_item_id = $1",
    [itemId],
  ))[0];
const accountsOf = (connectionId: string) =>
  db.admin<{ id: string; kind: string; shared: boolean; last4: string | null; external_account_id: string }>(
    "select id, kind, shared, last4, external_account_id from public.bank_accounts where connection_id = $1 order by kind",
    [connectionId],
  );
const storedTxns = (accountId: string) =>
  db.admin<{ external_id: string; amount: string; direction: string; category: string; status: string; merchant: string | null }>(
    "select external_id, amount::text, direction, category, status, merchant from public.bank_transactions where account_id = $1 order by external_id",
    [accountId],
  );

/** A dependent who connected a bank through the widget and shared the checking account. */
async function connectedAndShared(opts: { paid?: boolean } = {}) {
  const s = await sharing(db, opts);
  const itemId = pluggy.connect(s.dependent);
  expect((await sync(s.dependent, itemId)).status).toBe(200);
  const conn = await connectionOf(itemId);
  // Ordered by kind: checking, then credit_card.
  const [checking, card] = await accountsOf(conn.id);
  expect((await share(db, s.dependent, checking.id)).error).toBeNull();
  return { ...s, itemId, conn, checking, card, pluggyChecking: `${itemId}-acc-checking`, pluggyCard: `${itemId}-acc-card` };
}

/* ── tests ─────────────────────────────────────────────────────────────────── */

describe("bank-connect-token", () => {
  it("needs a session", async () => {
    expect((await tokenFor(undefined)).status).toBe(401);
  });

  it("is only for someone sharing with a family", async () => {
    const loner = await user(db, "loner");
    const res = await tokenFor(loner);
    expect(res).toMatchObject({ status: 403, body: { code: "not_a_dependent" } });
  });

  it("gives a dependent a token made for them, and never the aggregator's keys", async () => {
    const s = await sharing(db);
    const res = await tokenFor(s.dependent);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connectToken: `connect-token-for-${s.dependent}`, includeSandbox: true });
    expect(JSON.stringify(res.body)).not.toContain(ENV.pluggyClientSecret);
    const tokenCall = pluggy.calls.find((c) => c.path === "/connect_token");
    expect(tokenCall?.body).toMatchObject({ options: { clientUserId: s.dependent, avoidDuplicates: true } });
  });

  it("free plan: one bank; reopening that one is still allowed, someone else's is not found", async () => {
    const s = await sharing(db);
    const itemId = pluggy.connect(s.dependent);
    await sync(s.dependent, itemId);
    expect(await tokenFor(s.dependent)).toMatchObject({ status: 402, body: { code: "plan_limit_connections" } });
    expect((await tokenFor(s.dependent, { itemId })).status).toBe(200);

    const other = await sharing(db);
    expect((await tokenFor(other.dependent, { itemId })).status).toBe(404);
  });

  it("is unavailable, not broken, without Pluggy's keys", async () => {
    const s = await sharing(db);
    expect((await tokenFor(s.dependent, {}, { ...ENV, pluggyClientId: "" })).status).toBe(503);
  });
});

describe("bank-connection-sync", () => {
  it("refuses a connection made for someone else, and stores nothing", async () => {
    const a = await sharing(db);
    const b = await sharing(db);
    const itemId = pluggy.connect(a.dependent);
    expect(await sync(b.dependent, itemId)).toMatchObject({ status: 404, body: { code: "connection_not_yours" } });
    expect(await connectionOf(itemId)).toBeUndefined();
    expect((await sync(b.dependent, "no-such-item")).status).toBe(404);
  });

  it("stores the connection and its accounts unshared, and no entries until one is shared", async () => {
    const s = await sharing(db);
    const itemId = pluggy.connect(s.dependent);
    pluggy.addTxn(`${itemId}-acc-checking`);
    const res = await sync(s.dependent, itemId);
    expect(res).toMatchObject({ status: 200, body: { status: "active", accounts: 2, inserted: 0 } });
    const conn = await connectionOf(itemId);
    expect(conn).toMatchObject({ user_id: s.dependent, status: "active", institution_name: "Pluggy Bank (sandbox)" });
    const accounts = await accountsOf(conn.id);
    expect(accounts.map((a) => [a.kind, a.shared, a.last4])).toEqual([
      ["checking", false, "3456"],
      ["credit_card", false, "9876"],
    ]);
    expect(await db.admin("select 1 from public.bank_transactions where user_id = $1", [s.dependent])).toHaveLength(0);
  });

  it("reads a shared account in full, in cents and Flow's categories, every page, once", async () => {
    const c = await connectedAndShared();
    pluggy.addTxn(c.pluggyChecking, { id: "p-1", amount: -25.9, description: "PADARIA ESTRELA", category: "Bakery" });
    pluggy.addTxn(c.pluggyChecking, { id: "p-2", amount: -120.5, description: "UBER *TRIP", category: "Taxi and ride-hailing", status: "PENDING" });
    pluggy.addTxn(c.pluggyChecking, { id: "p-3", amount: 3500, type: "CREDIT", description: "SALARIO", category: "Salary" });
    pluggy.addTxn(c.pluggyChecking, { id: "p-4", amount: -50, description: "BET365", category: "Gambling" });
    pluggy.addTxn(c.pluggyChecking, { id: "p-5", amount: -800, description: "PAGAMENTO DE FATURA", category: "Credit card payment" });
    pluggy.addTxn(c.pluggyCard, { id: "p-card", amount: 99.9, description: "NETFLIX.COM" });

    const res = await sync(c.dependent, c.itemId);
    expect(res.body).toMatchObject({ status: "active", inserted: 5 });
    expect(await storedTxns(c.checking.id)).toEqual([
      { external_id: "p-1", amount: "2590", direction: "expense", category: "Eating out", status: "posted", merchant: null },
      { external_id: "p-2", amount: "12050", direction: "expense", category: "Transport", status: "pending", merchant: null },
      { external_id: "p-3", amount: "350000", direction: "income", category: "Income", status: "posted", merchant: null },
      { external_id: "p-4", amount: "5000", direction: "expense", category: "Betting & lotteries", status: "posted", merchant: null },
      { external_id: "p-5", amount: "80000", direction: "expense", category: "Internal", status: "posted", merchant: null },
    ]);
    // The card wasn't shared: nothing of it was read or stored.
    expect(await storedTxns(c.card.id)).toEqual([]);
    expect(pluggy.calls.some((x) => x.query.get("accountId") === c.pluggyCard)).toBe(false);
    // Three pages of two, every request to Pluggy's own host.
    expect(pluggy.calls.filter((x) => x.path === "/v2/transactions")).toHaveLength(3);
    expect(new Set(pluggy.calls.map((x) => x.host))).toEqual(new Set(["api.pluggy.test"]));

    // Again: nothing new, nothing doubled.
    expect((await sync(c.dependent, c.itemId)).body).toMatchObject({ inserted: 0 });
    expect(await storedTxns(c.checking.id)).toHaveLength(5);

    // The guardian sees them through the audited read.
    const seen = await feed(db, c.guardian, c.dependent);
    expect(seen.error).toBeNull();
    expect(seen.data).toHaveLength(5);
  });

  it("a connection that needs the person, or whose consent ended, is recorded and alerts the guardian", async () => {
    const c = await connectedAndShared();
    pluggy.items.get(c.itemId)!.status = "LOGIN_ERROR";
    pluggy.items.get(c.itemId)!.error = { code: "INVALID_CREDENTIALS" };
    expect((await sync(c.dependent, c.itemId)).body).toMatchObject({ status: "needs_attention", inserted: 0 });

    pluggy.items.get(c.itemId)!.status = "UPDATED";
    pluggy.items.get(c.itemId)!.error = null;
    pluggy.items.get(c.itemId)!.consentExpiresAt = new Date(Date.now() - 1000).toISOString();
    expect((await sync(c.dependent, c.itemId)).body).toMatchObject({ status: "expired" });
    expect(await connectionOf(c.itemId)).toMatchObject({ status: "expired", status_detail: "CONSENT_EXPIRED" });

    const alerts = await db.as(c.guardian).from("family_alert_events").select("kind").eq("dependent_id", c.dependent);
    expect((alerts.data as { kind: string }[]).map((a) => a.kind)).toEqual(["connection_expired"]);
  });

  it("a second bank opened past the free plan's limit is ended at Pluggy, not kept", async () => {
    const c = await connectedAndShared();
    const extra = pluggy.connect(c.dependent);
    expect(await sync(c.dependent, extra)).toMatchObject({ status: 402, body: { code: "plan_limit_connections" } });
    expect(await connectionOf(extra)).toBeUndefined();
    expect(pluggy.items.has(extra)).toBe(false);
  });

  it("the paid plan allows more", async () => {
    const c = await connectedAndShared({ paid: true });
    const extra = pluggy.connect(c.dependent);
    expect((await sync(c.dependent, extra)).status).toBe(200);
  });
});

describe("pluggy-webhook", () => {
  it("accepts nothing without the secret, with a wrong one, or when none is configured", async () => {
    expect((await hook({ event: "item/updated", itemId: "x" }, null)).status).toBe(401);
    expect((await hook({ event: "item/updated", itemId: "x" }, "whsec-fictitious-0123456788")).status).toBe(401);
    expect((await hook({ event: "item/updated", itemId: "x" }, "", { ...ENV, webhookSecret: "" })).status).toBe(401);
    expect(pluggy.calls).toHaveLength(0);
  });

  it("refuses a payload without an event id", async () => {
    const res = await call(
      webhook(
        req("pluggy-webhook", { event: "item/updated" }, { headers: { [SECRET_HEADER]: ENV.webhookSecret } }),
        ENV,
        make,
        pluggy.fetch,
        expo.fetch,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("a new purchase is stored and the guardian gets a push that says nothing about money, in well under a minute", async () => {
    const c = await connectedAndShared();
    expect(
      (await db.as(c.guardian).rpc("family_alert_rule_set", {
        p_family: c.familyId,
        p_dependent: c.dependent,
        p_kind: "large_purchase",
        p_enabled: true,
        p_threshold: 10000,
      })).error,
    ).toBeNull();
    expect((await db.as(c.guardian).rpc("push_token_register", { p_token: "ExponentPushToken[guardian-phone]", p_platform: "ios" })).error).toBeNull();

    const before = new Date(Date.now() - 1000).toISOString();
    pluggy.addTxn(c.pluggyChecking, { id: "big-1", amount: -459.9, description: "LOJA DE ELETRONICOS", category: "Electronics" });
    const started = Date.now();
    const res = await hook({ event: "transactions/created", itemId: c.itemId, accountId: c.pluggyChecking, transactionsCreatedAtFrom: before });
    const elapsed = Date.now() - started;

    expect(res).toMatchObject({ status: 200, body: { ok: true, outcome: "transactions:1" } });
    expect(elapsed).toBeLessThan(60_000);
    expect(await storedTxns(c.checking.id)).toEqual([
      { external_id: "big-1", amount: "45990", direction: "expense", category: "Shopping", status: "posted", merchant: null },
    ]);
    expect(expo.sent).toHaveLength(1);
    expect(expo.sent[0]).toMatchObject({ to: "ExponentPushToken[guardian-phone]", title: "Flow Family", body: "New alert about Ana. Open Flow to see it." });
    expect(JSON.stringify(expo.sent[0])).not.toMatch(/459|45990|ELETRONICOS|Shopping/);
    const events = await db.admin<{ push_status: string }>("select push_status from public.family_alert_events where dependent_id = $1", [c.dependent]);
    expect(events.map((e) => e.push_status)).toEqual(["sent"]);
  });

  it("the same event delivered twice is processed once", async () => {
    const c = await connectedAndShared();
    pluggy.addTxn(c.pluggyChecking, { id: "dup-1" });
    const payload = {
      eventId: "evt-fixed-dup",
      event: "transactions/created",
      itemId: c.itemId,
      accountId: c.pluggyChecking,
      transactionsCreatedAtFrom: new Date(Date.now() - 60_000).toISOString(),
    };
    expect((await hook(payload)).body).toMatchObject({ ok: true, outcome: "transactions:1" });
    const callsAfterFirst = pluggy.calls.length;
    expect((await hook(payload)).body).toEqual({ ok: true, duplicate: true });
    expect(pluggy.calls.length).toBe(callsAfterFirst);
    expect(await storedTxns(c.checking.id)).toHaveLength(1);
  });

  it("changed and withdrawn entries are read back from Pluggy, not taken from the body", async () => {
    const c = await connectedAndShared();
    const t = pluggy.addTxn(c.pluggyChecking, { id: "chg-1", amount: -10, status: "PENDING" });
    await sync(c.dependent, c.itemId);
    t.amount = -12.5;
    t.status = "POSTED";
    expect((await hook({ event: "transactions/updated", itemId: c.itemId, accountId: c.pluggyChecking, transactionIds: ["chg-1"], amount: 1 })).body).toMatchObject({
      outcome: "transactions:0",
    });
    expect(await storedTxns(c.checking.id)).toMatchObject([{ external_id: "chg-1", amount: "1250", status: "posted" }]);

    expect((await hook({ event: "transactions/deleted", itemId: c.itemId, accountId: c.pluggyChecking, transactionIds: ["chg-1"] })).body).toMatchObject({
      outcome: "transactions:1",
    });
    expect(await storedTxns(c.checking.id)).toEqual([]);
  });

  it("ignores entries of an account that isn't shared, or of a connection Flow doesn't have", async () => {
    const c = await connectedAndShared();
    pluggy.addTxn(c.pluggyCard, { id: "card-1" });
    const from = new Date(Date.now() - 60_000).toISOString();
    expect((await hook({ event: "transactions/created", itemId: c.itemId, accountId: c.pluggyCard, transactionsCreatedAtFrom: from })).body).toMatchObject({
      outcome: "transactions:0",
    });
    expect((await hook({ event: "transactions/created", itemId: "unknown", accountId: c.pluggyChecking, transactionsCreatedAtFrom: from })).body).toMatchObject(
      { outcome: "transactions:0" },
    );
    expect(await storedTxns(c.card.id)).toEqual([]);
  });

  it("a connection's first webhook can arrive before the app's sync, and is stored for the right person", async () => {
    const s = await sharing(db);
    const itemId = pluggy.connect(s.dependent);
    expect((await hook({ event: "item/created", itemId })).body).toMatchObject({ outcome: "synced:active:0" });
    expect(await connectionOf(itemId)).toMatchObject({ user_id: s.dependent });
  });

  it("a connection made outside Flow is ignored", async () => {
    const itemId = pluggy.connect("someone-from-the-pluggy-dashboard");
    expect((await hook({ event: "item/updated", itemId })).body).toMatchObject({ outcome: "ignored" });
    expect(await connectionOf(itemId)).toBeUndefined();
  });

  it("item/deleted forgets the connection and what was read through it", async () => {
    const c = await connectedAndShared();
    pluggy.addTxn(c.pluggyChecking);
    await sync(c.dependent, c.itemId);
    pluggy.items.delete(c.itemId);
    expect((await hook({ event: "item/deleted", itemId: c.itemId })).body).toMatchObject({ outcome: "forgotten" });
    expect(await connectionOf(c.itemId)).toBeUndefined();
    expect(await db.admin("select 1 from public.bank_transactions where user_id = $1", [c.dependent])).toHaveLength(0);
  });

  it("when Pluggy is down it answers 500, so Pluggy delivers again, and the redelivery is processed", async () => {
    const c = await connectedAndShared();
    pluggy.addTxn(c.pluggyChecking, { id: "late-1" });
    const payload = {
      eventId: "evt-fixed-retry",
      event: "transactions/created",
      itemId: c.itemId,
      accountId: c.pluggyChecking,
      transactionsCreatedAtFrom: new Date(Date.now() - 60_000).toISOString(),
    };
    pluggy.down = true;
    expect((await hook(payload)).status).toBe(500);
    const [row] = await db.admin<{ processed_at: string | null; error: string | null }>(
      "select processed_at, error from public.bank_webhook_events where event_id = 'evt-fixed-retry'",
    );
    expect(row.processed_at).toBeNull();
    expect(row.error).toBeTruthy();

    pluggy.down = false;
    expect((await hook(payload)).body).toMatchObject({ outcome: "transactions:1" });
    expect(await storedTxns(c.checking.id)).toHaveLength(1);
  });

  it("drops device tokens Expo says are gone, and marks undelivered alerts", async () => {
    const c = await connectedAndShared();
    await db.as(c.guardian).rpc("family_alert_rule_set", {
      p_family: c.familyId,
      p_dependent: c.dependent,
      p_kind: "large_purchase",
      p_enabled: true,
      p_threshold: 100,
    });
    await db.as(c.guardian).rpc("push_token_register", { p_token: "ExponentPushToken[old-phone]", p_platform: "android" });
    expo.gone.add("ExponentPushToken[old-phone]");
    pluggy.addTxn(c.pluggyChecking, { id: "x-1", amount: -5 });
    await hook({ event: "transactions/created", itemId: c.itemId, accountId: c.pluggyChecking, transactionsCreatedAtFrom: new Date(Date.now() - 60_000).toISOString() });
    expect(await db.admin("select 1 from public.push_tokens where user_id = $1", [c.guardian])).toHaveLength(0);
    const events = await db.admin<{ push_status: string }>("select push_status from public.family_alert_events where dependent_id = $1", [c.dependent]);
    expect(events.map((e) => e.push_status)).toEqual(["failed"]);
  });
});

describe("bank-connection-delete", () => {
  it("only the owner can disconnect", async () => {
    const c = await connectedAndShared();
    const other = await sharing(db);
    expect((await disconnect(other.dependent, c.conn.id)).status).toBe(404);
    expect((await disconnect(c.guardian, c.conn.id)).status).toBe(404);
    expect(await connectionOf(c.itemId)).toBeDefined();
  });

  it("ends the connection at Pluggy and deletes everything read through it", async () => {
    const c = await connectedAndShared();
    pluggy.addTxn(c.pluggyChecking);
    await sync(c.dependent, c.itemId);
    expect(await disconnect(c.dependent, c.conn.id)).toEqual({ status: 200, body: { removed: true, providerPending: false } });
    expect(pluggy.items.has(c.itemId)).toBe(false);
    expect(await connectionOf(c.itemId)).toBeUndefined();
    expect(await db.admin("select 1 from public.bank_transactions where user_id = $1", [c.dependent])).toHaveLength(0);
    const audit = await db.as(c.dependent).from("family_audit_log").select("action").eq("action", "bank_disconnected");
    expect(audit.data).toHaveLength(1);
  });

  it("with Pluggy down, the data still goes now and the connection is ended later", async () => {
    const c = await connectedAndShared();
    pluggy.down = true;
    expect(await disconnect(c.dependent, c.conn.id)).toEqual({ status: 200, body: { removed: true, providerPending: true } });
    expect(await connectionOf(c.itemId)).toBeUndefined();
    expect(await db.admin("select 1 from public.bank_item_tombstones where external_item_id = $1", [c.itemId])).toHaveLength(1);

    // The next webhook retries it.
    pluggy.down = false;
    await hook({ event: "connector/status_updated", data: { status: "ONLINE" } });
    expect(pluggy.items.has(c.itemId)).toBe(false);
    expect(await db.admin("select 1 from public.bank_item_tombstones where external_item_id = $1", [c.itemId])).toHaveLength(0);
  });
});

describe("delete-account with Flow Family", () => {
  const remove = (as: string) =>
    call(
      deleteAccount(req("delete-account", { password: PASSWORD }, { as }), { url: ENV.url, anon: ENV.anon, service: ENV.service, ...pluggyEnv }, make, pluggy.fetch),
    );
  const pluggyEnv = { pluggyClientId: ENV.pluggyClientId, pluggyClientSecret: ENV.pluggyClientSecret, pluggyBaseUrl: ENV.pluggyBaseUrl };

  it("disconnects the person's banks at Pluggy and leaves nothing of theirs", async () => {
    const c = await connectedAndShared();
    pluggy.addTxn(c.pluggyChecking);
    await sync(c.dependent, c.itemId);
    expect(await remove(c.dependent)).toEqual({ status: 200, body: { deleted: true } });
    expect(pluggy.items.has(c.itemId)).toBe(false);
    for (const [table, column] of [
      ["bank_connections", "user_id"],
      ["bank_accounts", "user_id"],
      ["bank_transactions", "user_id"],
      ["family_members", "user_id"],
      ["family_consents", "dependent_id"],
      ["family_alert_events", "dependent_id"],
      ["push_tokens", "user_id"],
    ]) {
      expect(await db.admin(`select 1 from public.${table} where ${column} = $1`, [c.dependent]), table).toHaveLength(0);
    }
    // The guardian can no longer read anything of theirs.
    expect((await feed(db, c.guardian, c.dependent)).data ?? []).toHaveLength(0);
  });

  it("an unreachable Pluggy doesn't stop the deletion; the connection is queued", async () => {
    const c = await connectedAndShared();
    pluggy.down = true;
    expect((await remove(c.dependent)).status).toBe(200);
    expect(await db.admin("select 1 from auth.users where id = $1", [c.dependent])).toHaveLength(0);
    const tomb = await db.admin<Record<string, unknown>>("select * from public.bank_item_tombstones where external_item_id = $1", [c.itemId]);
    expect(tomb).toHaveLength(1);
    // The queue holds the aggregator's id and nothing that points to the person.
    expect(Object.keys(tomb[0]).sort()).toEqual(["attempts", "created_at", "external_item_id", "last_error", "provider"]);
  });

  it("a guardian deleting their account ends the family; the dependent keeps their own data", async () => {
    const c = await connectedAndShared();
    await paid(db, c.guardian);
    expect((await remove(c.guardian)).status).toBe(200);
    expect(await db.admin("select 1 from public.families where id = $1", [c.familyId])).toHaveLength(0);
    expect(await connectionOf(c.itemId)).toBeDefined();
    expect(pluggy.items.has(c.itemId)).toBe(true);
  });
});
