// @vitest-environment node
/**
 * Banks outside Brazil, end to end against the real migrations: Plaid (US,
 * CA, UK, EU) and Salt Edge (other countries), each simulated in memory with
 * the request and response shapes the connectors expect. Webhook signatures
 * are real: an ES256 key and an RSA key are generated per run. Every person
 * and bank is fictitious; no request leaves the machine.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { b64encode, openSecret, sealSecret, sha256Hex, verifyPlaidJwt } from "../../functions/_shared/crypto";
import { runMaintenance } from "../../functions/_shared/maintenance";
import type { Fetch } from "../../functions/_shared/pluggy";
import { plaidCategory, plaidStatus, providersFromEnv, saltEdgeAccountRow } from "../../functions/_shared/providers";
import { handle as connectToken } from "../../functions/bank-connect-token/index";
import { handle as syncFn } from "../../functions/bank-connection-sync/index";
import { handle as deleteConnection } from "../../functions/bank-connection-delete/index";
import { handle as plaidWebhook } from "../../functions/plaid-webhook/index";
import { handle as saltedgeWebhook } from "../../functions/saltedge-webhook/index";
import { handle as maintenanceFn } from "../../functions/family-maintenance/index";
import { handle as deleteAccount } from "../../functions/delete-account/index";
import { createDb, type TestDb } from "./harness";
import { sharing } from "./fixtures";
import { BASE_ENV, makeFor, PASSWORD, post, read } from "./functionsHarness";

let db: TestDb;
beforeAll(async () => {
  db = await createDb();
  ecKeys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  rsaKeys = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", rsaKeys.publicKey));
  rsaPublicPem = `-----BEGIN PUBLIC KEY-----\n${b64encode(spki)}\n-----END PUBLIC KEY-----`;
});
afterAll(async () => {
  await db.close();
});

let ecKeys: CryptoKeyPair;
let rsaKeys: CryptoKeyPair;
let rsaPublicPem = "";
const TOKEN_KEY = b64encode(new Uint8Array(32).fill(7));
let seq = 0;
const next = () => ++seq;

/* ── A fake Plaid ──────────────────────────────────────────────────────── */

interface FakePlaidTxn {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string;
  unofficial_currency_code: null;
  date: string;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  personal_finance_category: { primary: string; detailed: string } | null;
  merchant_category_code: string | null;
}

class FakePlaid {
  linkTokens = new Map<string, { publicTokens: { token: string; institution: string }[]; body: Record<string, unknown> }>();
  publicTokens = new Map<string, string>(); // public → item
  items = new Map<string, { accessToken: string; error: { error_code: string } | null; removed: boolean; log: { kind: "added" | "removed"; txn: FakePlaidTxn }[] }>();
  accounts = new Map<string, unknown[]>();
  down = false;
  calls: string[] = [];

  /** The person finishes Plaid Link and connects a bank. */
  complete(linkToken: string, institution = "First Platypus Bank") {
    const n = next();
    const itemId = `plaid-item-${n}`;
    this.items.set(itemId, { accessToken: `access-sandbox-${n}`, error: null, removed: false, log: [] });
    this.accounts.set(itemId, [
      { account_id: `${itemId}-chk`, name: "Plaid Checking", official_name: "Plaid Gold Standard 0% Interest Checking", mask: "0000", type: "depository", subtype: "checking", balances: { iso_currency_code: "USD", unofficial_currency_code: null } },
      { account_id: `${itemId}-cc`, name: "Plaid Credit Card", official_name: null, mask: "3333", type: "credit", subtype: "credit card", balances: { iso_currency_code: "USD", unofficial_currency_code: null } },
      { account_id: `${itemId}-inv`, name: "Plaid IRA", official_name: null, mask: "5555", type: "investment", subtype: "ira", balances: { iso_currency_code: "USD", unofficial_currency_code: null } },
    ]);
    const pub = `public-sandbox-${n}`;
    this.publicTokens.set(pub, itemId);
    this.linkTokens.get(linkToken)!.publicTokens.push({ token: pub, institution });
    return itemId;
  }

  add(itemId: string, over: Partial<FakePlaidTxn>) {
    const txn: FakePlaidTxn = {
      transaction_id: `ptxn-${next()}`,
      account_id: `${itemId}-chk`,
      amount: 12.5,
      iso_currency_code: "USD",
      unofficial_currency_code: null,
      date: new Date().toISOString().slice(0, 10),
      name: "SparkFun",
      merchant_name: "SparkFun",
      pending: false,
      personal_finance_category: { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_ELECTRONICS" },
      merchant_category_code: null,
      ...over,
    };
    this.items.get(itemId)!.log.push({ kind: "added", txn });
    return txn;
  }

  remove(itemId: string, txn: FakePlaidTxn) {
    this.items.get(itemId)!.log.push({ kind: "removed", txn });
  }

  private itemFor(accessToken: string) {
    for (const [id, it] of this.items) if (it.accessToken === accessToken && !it.removed) return [id, it] as const;
    return null;
  }

  fetch: Fetch = async (input, init) => {
    const path = new URL(input).pathname;
    this.calls.push(path);
    if (this.down) return Response.json({ error_code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
    const headers = init?.headers as Record<string, string>;
    if (headers["PLAID-CLIENT-ID"] !== "plaid-client" || headers["PLAID-SECRET"] !== "plaid-secret") return Response.json({ error_code: "INVALID_API_KEYS" }, { status: 400 });
    const body = JSON.parse(String(init?.body ?? "{}"));
    const bad = () => Response.json({ error_type: "INVALID_INPUT", error_code: "INVALID_ACCESS_TOKEN" }, { status: 400 });
    switch (path) {
      case "/link/token/create": {
        const token = `link-sandbox-${next()}`;
        this.linkTokens.set(token, { publicTokens: [], body });
        return Response.json({ link_token: token, expiration: new Date(Date.now() + 3600_000).toISOString(), hosted_link_url: `https://hosted.plaid.test/link/${token}` });
      }
      case "/link/token/get": {
        const l = this.linkTokens.get(body.link_token);
        if (!l) return Response.json({ error_code: "INVALID_LINK_TOKEN" }, { status: 400 });
        return Response.json({
          link_token: body.link_token,
          link_sessions: [{ link_session_id: "s1", results: { item_add_results: l.publicTokens.map((p) => ({ public_token: p.token, accounts: [], institution: { name: p.institution } })) } }],
        });
      }
      case "/item/public_token/exchange": {
        const itemId = this.publicTokens.get(body.public_token);
        if (!itemId) return Response.json({ error_code: "INVALID_PUBLIC_TOKEN" }, { status: 400 });
        this.publicTokens.delete(body.public_token);
        return Response.json({ access_token: this.items.get(itemId)!.accessToken, item_id: itemId });
      }
      case "/item/get": {
        const hit = this.itemFor(body.access_token);
        if (!hit) return bad();
        return Response.json({ item: { item_id: hit[0], institution_id: "ins_109508", institution_name: null, error: hit[1].error, consent_expiration_time: null } });
      }
      case "/institutions/get_by_id":
        return Response.json({ institution: { name: "First Platypus Bank" } });
      case "/accounts/get": {
        const hit = this.itemFor(body.access_token);
        return hit ? Response.json({ accounts: this.accounts.get(hit[0]) }) : bad();
      }
      case "/transactions/sync": {
        const hit = this.itemFor(body.access_token);
        if (!hit) return bad();
        const start = body.cursor ? Number(body.cursor) : 0;
        const page = hit[1].log.slice(start, start + 2);
        const end = start + page.length;
        return Response.json({
          added: page.filter((e) => e.kind === "added").map((e) => e.txn),
          modified: [],
          removed: page.filter((e) => e.kind === "removed").map((e) => ({ transaction_id: e.txn.transaction_id, account_id: e.txn.account_id })),
          next_cursor: String(end),
          has_more: end < hit[1].log.length,
        });
      }
      case "/item/remove": {
        const hit = this.itemFor(body.access_token);
        if (!hit) return bad();
        hit[1].removed = true;
        return Response.json({ request_id: "r" });
      }
      case "/webhook_verification_key/get": {
        const jwk = await crypto.subtle.exportKey("jwk", ecKeys.publicKey);
        return Response.json({ key: { ...jwk, kid: body.key_id, alg: "ES256", use: "sig", created_at: 0, expired_at: null } });
      }
    }
    return Response.json({ error_code: "NOT_FOUND" }, { status: 404 });
  };
}

/* ── A fake Salt Edge ──────────────────────────────────────────────────── */

class FakeSaltEdge {
  customers = new Map<string, string>(); // id → identifier
  connections = new Map<string, { id: string; customer_id: string; provider_name: string; country_code: string; status: string; removed?: boolean }>();
  accounts = new Map<string, unknown[]>();
  txns = new Map<string, unknown[]>();
  sessions: Record<string, unknown>[] = [];
  removed: string[] = [];

  /** The person finishes Salt Edge Connect at a German bank. */
  connect(customerId: string, status = "active") {
    const id = String(100000 + next());
    this.connections.set(id, { id, customer_id: customerId, provider_name: "Fake Bank Simple", country_code: "XF", status });
    this.accounts.set(id, [
      { id: `${id}1`, connection_id: id, name: "Girokonto", nature: "account", currency_code: "EUR", extra: { iban: "DE89370400440532013000" } },
      { id: `${id}2`, connection_id: id, name: "Kreditkarte", nature: "credit_card", currency_code: "EUR", extra: { cards: ["4242 **** **** 9911"] } },
      { id: `${id}3`, connection_id: id, name: "Depot", nature: "investment", currency_code: "EUR" },
    ]);
    return id;
  }

  fetch: Fetch = async (input, init) => {
    const url = new URL(input);
    const headers = init?.headers as Record<string, string>;
    if (headers["App-id"] !== "se-app" || headers.Secret !== "se-secret") return Response.json({ error: { class: "WrongCredentials", message: "no" } }, { status: 401 });
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^\/api\/v5/, "");
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (method === "POST" && path === "/customers") {
      if ([...this.customers.values()].includes(body.data.identifier)) return Response.json({ error: { class: "DuplicatedCustomer", message: "dup" } }, { status: 409 });
      const id = String(900 + next());
      this.customers.set(id, body.data.identifier);
      return Response.json({ data: { id, identifier: body.data.identifier, secret: "s" } });
    }
    if (method === "GET" && path === "/customers") return Response.json({ data: [...this.customers].map(([id, identifier]) => ({ id, identifier })), meta: { next_id: null } });
    if (method === "POST" && (path === "/connect_sessions/create" || path === "/connect_sessions/reconnect")) {
      this.sessions.push(body.data);
      return Response.json({ data: { connect_url: `https://www.saltedge.test/connect?token=${next()}`, expires_at: new Date(Date.now() + 3600_000).toISOString() } });
    }
    if (method === "GET" && path === "/connections") {
      return Response.json({ data: [...this.connections.values()].filter((c) => c.customer_id === url.searchParams.get("customer_id") && !c.removed) });
    }
    const conn = /^\/connections\/(.+)$/.exec(path);
    if (conn) {
      const c = this.connections.get(decodeURIComponent(conn[1]));
      if (!c || c.removed) return Response.json({ error: { class: "ConnectionNotFound", message: "nf" } }, { status: 404 });
      if (method === "DELETE") {
        c.removed = true;
        this.removed.push(c.id);
        return Response.json({ data: { removed: true, id: c.id } });
      }
      return Response.json({ data: c });
    }
    if (path === "/accounts") return Response.json({ data: this.accounts.get(url.searchParams.get("connection_id") ?? "") ?? [], meta: { next_id: null } });
    if (path === "/transactions" || path === "/transactions/pending") {
      const all = (this.txns.get(url.searchParams.get("account_id") ?? "") ?? []) as { status?: string }[];
      const wanted = all.filter((t) => (path === "/transactions/pending" ? t.status === "pending" : t.status !== "pending"));
      return Response.json({ data: wanted, meta: { next_id: null } });
    }
    return Response.json({ error: { class: "NotFound", message: path } }, { status: 404 });
  };
}

/* ── Wiring ────────────────────────────────────────────────────────────── */

let plaid: FakePlaid;
let se: FakeSaltEdge;
beforeEach(() => {
  plaid = new FakePlaid();
  se = new FakeSaltEdge();
});

const ENV = {
  ...BASE_ENV,
  plaidClientId: "plaid-client",
  plaidSecret: "plaid-secret",
  plaidEnvironment: "sandbox" as const,
  saltedgeAppId: "se-app",
  saltedgeSecret: "se-secret",
  saltedgeCallbackUrl: "https://flow.test/functions/v1/saltedge-webhook",
  bankTokenKey: TOKEN_KEY,
};
const env = () => ({ ...ENV, saltedgeCallbackPublicKey: rsaPublicPem });
/** One fetch for both providers, routed by host. */
const fetcher: Fetch = async (input, init) => {
  const host = new URL(input).host;
  if (host.includes("saltedge")) return se.fetch(input, init);
  if (host === "flow.test") {
    // delete-account asking family-maintenance to end what it queued.
    return maintenanceFn(new Request(input, init), env(), makeFor(db), fetcher);
  }
  if (host.includes("pluggy")) {
    // Just enough Pluggy for a connect token.
    return new URL(input).pathname === "/auth" ? Response.json({ apiKey: "k" }) : Response.json({ accessToken: "pluggy-connect-token" });
  }
  return plaid.fetch(input, init);
};

const token = (as: string, body: unknown, e = env()) => read(connectToken(post("bank-connect-token", body, { as }), e, makeFor(db), fetcher));
const sync = (as: string, body: unknown) => read(syncFn(post("bank-connection-sync", body, { as }), env(), makeFor(db), fetcher, async () => Response.json({ data: [] })));

async function plaidSigned(body: string, opts: { iat?: number; bodyForHash?: string } = {}) {
  const enc = (o: unknown) => b64encode(new TextEncoder().encode(JSON.stringify(o))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const head = enc({ alg: "ES256", kid: "kid-1", typ: "JWT" });
  const claims = enc({ iat: opts.iat ?? Math.floor(Date.now() / 1000), request_body_sha256: await sha256Hex(opts.bodyForHash ?? body) });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, ecKeys.privateKey, new TextEncoder().encode(`${head}.${claims}`)));
  return `${head}.${claims}.${b64encode(sig).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}
const plaidHook = async (payload: unknown, jwt?: string) => {
  const raw = JSON.stringify(payload);
  return read(
    plaidWebhook(post("plaid-webhook", null, { raw, headers: jwt === undefined ? { "Plaid-Verification": await plaidSigned(raw) } : jwt ? { "Plaid-Verification": jwt } : {} }), env(), makeFor(db), fetcher, async () =>
      Response.json({ data: [] }),
    ),
  );
};

async function seSign(url: string, body: string) {
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", rsaKeys.privateKey, new TextEncoder().encode(`${url}|${body}`)));
  return b64encode(sig);
}
const seHook = async (type: string, data: Record<string, unknown>, signature?: string) => {
  const raw = JSON.stringify({ data, meta: { version: "5", time: new Date().toISOString() } });
  const url = `https://flow.test/functions/v1/saltedge-webhook?type=${type}`;
  const sig = signature ?? (await seSign(url, raw));
  const req = new Request(url, { method: "POST", headers: { "content-type": "application/json", Signature: sig }, body: raw });
  return read(saltedgeWebhook(req, env(), makeFor(db), fetcher, async () => Response.json({ data: [] })));
};

const stored = (accountId: string) =>
  db.admin<{ external_id: string; amount: string; direction: string; category: string; currency: string; status: string }>(
    "select external_id, amount::text, direction, category, currency, status from public.bank_transactions where account_id = $1 order by external_id",
    [accountId],
  );
const connOf = async (provider: string, ext: string) =>
  (await db.admin<{ id: string; user_id: string; status: string; country_code: string | null; institution_name: string }>(
    "select id, user_id, status, country_code, institution_name from public.bank_connections where provider = $1 and external_item_id = $2",
    [provider, ext],
  ))[0];
const accountsOf = (connectionId: string) =>
  db.admin<{ id: string; kind: string; currency: string; external_account_id: string; last4: string | null }>(
    "select id, kind, currency, external_account_id, last4 from public.bank_accounts where connection_id = $1 order by kind",
    [connectionId],
  );
const share = (as: string, accountId: string) => db.as(as).rpc("bank_account_set_shared", { p_account: accountId, p_shared: true });

/** A dependent who connected a Plaid bank in the US and shared its checking account. */
async function plaidConnected(opts: { paid?: boolean } = { paid: true }) {
  const s = await sharing(db, opts);
  const start = await token(s.dependent, { country: "US" });
  expect(start.body).toMatchObject({ provider: "plaid" });
  const linkToken = String(start.body.url).split("/").pop()!;
  const itemId = plaid.complete(linkToken);
  expect((await sync(s.dependent, { session: start.body.session })).status).toBe(200);
  const conn = await connOf("plaid", itemId);
  const [checking, card] = await accountsOf(conn.id);
  expect((await share(s.dependent, checking.id)).error).toBeNull();
  return { ...s, itemId, conn, checking, card, linkToken };
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe("choosing the provider", () => {
  it("says which providers are on", async () => {
    const s = await sharing(db);
    expect((await token(s.dependent, { probe: true })).body).toEqual({ providers: { pluggy: false, plaid: true, saltedge: true } });
  });

  it("Plaid for the US, the UK and the EU; Salt Edge elsewhere; Pluggy for Brazil when it's on", async () => {
    const s = await sharing(db, { paid: true });
    for (const [country, provider] of [["US", "plaid"], ["GB", "plaid"], ["DE", "plaid"], ["JP", "saltedge"], ["ZA", "saltedge"], ["BR", "saltedge"]] as const) {
      expect((await token(s.dependent, { country })).body, country).toMatchObject({ provider });
    }
    const brazilOnly = await token(s.dependent, { country: "BR" }, { ...env(), pluggyClientId: "p", pluggyClientSecret: "s" });
    expect(brazilOnly.body).toMatchObject({ provider: "pluggy" });
  });

  it("says plainly when nothing covers the country", async () => {
    const s = await sharing(db);
    const res = await token(s.dependent, { country: "JP" }, { ...env(), saltedgeAppId: "" });
    expect(res).toMatchObject({ status: 503, body: { code: "provider_unavailable" } });
  });

  it("still checks the plan before opening anything", async () => {
    const loner = await sharing(db);
    await db.as(loner.dependent).rpc("family_leave", { p_family: loner.familyId });
    expect((await token(loner.dependent, { country: "US" })).body).toMatchObject({ code: "not_a_dependent" });
    expect(plaid.calls).toHaveLength(0);
  });
});

describe("Plaid", () => {
  it("opens Hosted Link for this person and country, returning to the app", async () => {
    const s = await sharing(db);
    const res = await token(s.dependent, { country: "CA" });
    expect(res.body).toMatchObject({ provider: "plaid", returnUrl: "flow://family/bank-return" });
    expect(String(res.body.url)).toMatch(/^https:\/\/hosted\.plaid\.test\/link\//);
    const sent = [...plaid.linkTokens.values()][0].body as Record<string, any>;
    expect(sent).toMatchObject({
      country_codes: ["CA"],
      user: { client_user_id: s.dependent },
      products: ["transactions"],
      webhook: "https://flow.test/functions/v1/plaid-webhook",
      hosted_link: { completion_redirect_uri: "flow://family/bank-return?provider=plaid", is_mobile_app: true },
    });
  });

  it("stores what the person connected, with the access token encrypted, and only their accounts that can be shared", async () => {
    const c = await plaidConnected();
    expect(c.conn).toMatchObject({ user_id: c.dependent, status: "active", country_code: "US", institution_name: "First Platypus Bank" });
    const accounts = await accountsOf(c.conn.id);
    expect(accounts.map((a) => [a.kind, a.currency, a.last4])).toEqual([
      ["checking", "USD", "0000"],
      ["credit_card", "USD", "3333"],
    ]);
    const [cred] = await db.admin<{ secret: string }>("select secret from public.bank_credentials where connection_id = $1", [c.conn.id]);
    expect(cred.secret).not.toContain("access-sandbox");
    expect(await openSecret(cred.secret, TOKEN_KEY)).toMatch(/^access-sandbox-/);
  });

  it("reads transactions in their currency and Flow's categories, follows the cursor, drops removed ones", async () => {
    const c = await plaidConnected();
    plaid.add(c.itemId, { transaction_id: "p1", amount: 89.4, personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_GROCERIES" } });
    plaid.add(c.itemId, { transaction_id: "p2", amount: 40, merchant_category_code: "7995", personal_finance_category: { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS" } });
    plaid.add(c.itemId, { transaction_id: "p3", amount: -2500, name: "PAYROLL", personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES" } });
    const gone = plaid.add(c.itemId, { transaction_id: "p4", amount: 5, pending: true });
    plaid.add(c.itemId, { transaction_id: "p5", amount: 500, personal_finance_category: { primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" } });
    plaid.add(c.itemId, { transaction_id: "c1", account_id: `${c.itemId}-cc`, amount: 15 });
    expect((await sync(c.dependent, { connectionId: c.conn.id })).body).toMatchObject({ status: "active", inserted: 5 });
    expect(await stored(c.checking.id)).toEqual([
      { external_id: "p1", amount: "8940", direction: "expense", category: "Groceries", currency: "USD", status: "posted" },
      { external_id: "p2", amount: "4000", direction: "expense", category: "Betting & lotteries", currency: "USD", status: "posted" },
      { external_id: "p3", amount: "250000", direction: "income", category: "Income", currency: "USD", status: "posted" },
      { external_id: "p4", amount: "500", direction: "expense", category: "Shopping", currency: "USD", status: "pending" },
      { external_id: "p5", amount: "50000", direction: "expense", category: "Internal", currency: "USD", status: "posted" },
    ]);
    expect(await stored(c.card.id)).toEqual([]);

    plaid.remove(c.itemId, gone);
    expect((await sync(c.dependent, { connectionId: c.conn.id })).body).toMatchObject({ inserted: 0 });
    expect((await stored(c.checking.id)).map((r) => r.external_id)).toEqual(["p1", "p2", "p3", "p5"]);
  });

  it("refuses a window someone else opened", async () => {
    const a = await sharing(db);
    const b = await sharing(db);
    const start = await token(a.dependent, { country: "US" });
    plaid.complete(String(start.body.url).split("/").pop()!);
    expect((await sync(b.dependent, { session: start.body.session })).status).toBe(404);
    expect(await db.admin("select 1 from public.bank_connections where user_id = $1", [b.dependent])).toHaveLength(0);
  });

  it("a connection that needs the person's login again is recorded as such", async () => {
    const c = await plaidConnected();
    plaid.items.get(c.itemId)!.error = { error_code: "ITEM_LOGIN_REQUIRED" };
    expect((await sync(c.dependent, { connectionId: c.conn.id })).body).toMatchObject({ status: "needs_attention" });
    expect(plaidStatus({ item_id: "x", error: { error_code: "USER_PERMISSION_REVOKED" }, consent_expiration_time: null }).status).toBe("expired");
  });

  it("webhooks: only with Plaid's signature, over this exact body, recent", async () => {
    const c = await plaidConnected();
    plaid.add(c.itemId, { transaction_id: "w1", amount: 9.99 });
    const payload = { webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: c.itemId, environment: "sandbox" };
    const raw = JSON.stringify(payload);
    expect((await plaidHook(payload, "")).status).toBe(401);
    expect((await plaidHook(payload, await plaidSigned(raw, { bodyForHash: raw.replace("TRANSACTIONS", "ITEM") }))).status).toBe(401);
    expect((await plaidHook(payload, await plaidSigned(raw, { iat: Math.floor(Date.now() / 1000) - 600 }))).status).toBe(401);
    expect(await stored(c.checking.id)).toEqual([]);

    expect((await plaidHook(payload)).body).toMatchObject({ ok: true, outcome: "synced:active:1" });
    expect((await stored(c.checking.id)).map((r) => r.external_id)).toEqual(["w1"]);
    expect((await plaidHook(payload)).body).toEqual({ ok: true, duplicate: true });
  });

  it("a Link session that ends while the app is away still becomes a connection", async () => {
    const s = await sharing(db);
    const start = await token(s.dependent, { country: "US" });
    const linkToken = String(start.body.url).split("/").pop()!;
    const itemId = plaid.complete(linkToken);
    expect((await plaidHook({ webhook_type: "LINK", webhook_code: "ITEM_ADD_RESULT", link_token: linkToken, public_token: "ignored", environment: "sandbox" })).body).toMatchObject({
      outcome: "linked:1",
    });
    expect(await connOf("plaid", itemId)).toMatchObject({ user_id: s.dependent });
    // The app coming back later finds it done, and nothing doubles.
    expect((await sync(s.dependent, { session: start.body.session })).status).toBe(200);
    expect(await db.admin("select 1 from public.bank_connections where user_id = $1", [s.dependent])).toHaveLength(1);
  });

  it("disconnecting removes the item at Plaid; with Plaid down it's queued with its sealed token and retried", async () => {
    const c = await plaidConnected();
    const del = (as: string, id: string) => read(deleteConnection(post("bank-connection-delete", { connectionId: id }, { as }), env(), makeFor(db), fetcher));
    expect(await del(c.dependent, c.conn.id)).toEqual({ status: 200, body: { removed: true, providerPending: false } });
    expect(plaid.items.get(c.itemId)!.removed).toBe(true);

    const d = await plaidConnected();
    plaid.down = true;
    expect(await del(d.dependent, d.conn.id)).toEqual({ status: 200, body: { removed: true, providerPending: true } });
    const [tomb] = await db.admin<{ credential: string }>("select credential from public.bank_item_tombstones where external_item_id = $1", [d.itemId]);
    expect(tomb.credential).toMatch(/^v1:/);
    plaid.down = false;
    await runMaintenance(db.service(), providersFromEnv(env(), fetcher), { force: true, limit: 100 });
    expect(plaid.items.get(d.itemId)!.removed).toBe(true);
  });

  it("maps categories without Plaid's own when it has none", () => {
    const t = { transaction_id: "x", account_id: "a", amount: 3, iso_currency_code: "GBP", unofficial_currency_code: null, date: "2026-11-10", name: "TESCO STORES 2041", merchant_name: "Tesco", pending: false, personal_finance_category: null };
    expect(plaidCategory({ ...t, name: "UBER *TRIP", merchant_name: "Uber" }, "expense")).toBe("Transport");
    expect(plaidCategory({ ...t, personal_finance_category: { primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_ACCOUNT_TRANSFER" } }, "expense")).toBe("Internal");
  });
});

describe("Salt Edge", () => {
  async function saltEdgeConnected(country = "JP") {
    const s = await sharing(db, { paid: true });
    const start = await token(s.dependent, { country });
    expect(start.body).toMatchObject({ provider: "saltedge" });
    const [customerId] = [...se.customers.keys()].filter((id) => se.customers.get(id) === s.dependent);
    const ext = se.connect(customerId);
    expect((await sync(s.dependent, { session: start.body.session })).status).toBe(200);
    const conn = await connOf("saltedge", ext);
    return { ...s, customerId, ext, conn, start };
  }

  it("creates one customer per person and opens Connect for their country", async () => {
    const s = await sharing(db, { paid: true });
    await token(s.dependent, { country: "MX" });
    await token(s.dependent, { country: "MX" });
    expect([...se.customers.values()].filter((v) => v === s.dependent)).toHaveLength(1);
    expect(se.sessions[0]).toMatchObject({
      allowed_countries: ["MX"],
      include_fake_providers: false,
      consent: { scopes: ["account_details", "transactions_details"] },
      attempt: { return_to: "flow://family/bank-return?provider=saltedge" },
    });
    // "Another country": no filter, Salt Edge's own list.
    await token(s.dependent, { country: "XX" });
    expect(se.sessions[2]).not.toHaveProperty("allowed_countries");
  });

  it("offers its test banks only to review accounts", async () => {
    const s = await sharing(db);
    await token(s.dependent, { country: "JP" }, { ...env(), sandboxUserIds: [s.dependent] });
    expect(se.sessions[0]).toMatchObject({ include_fake_providers: true });
  });

  it("stores the connection, maps accounts, and reads shared ones in their currency", async () => {
    const c = await saltEdgeConnected();
    expect(c.conn).toMatchObject({ user_id: c.dependent, status: "active", institution_name: "Fake Bank Simple" });
    const accounts = await accountsOf(c.conn.id);
    expect(accounts.map((a) => [a.kind, a.currency, a.last4])).toEqual([
      ["checking", "EUR", "3000"],
      ["credit_card", "EUR", "9911"],
    ]);
    const checking = accounts[0];
    se.txns.set(checking.external_account_id, [
      { id: 1, account_id: checking.external_account_id, made_on: new Date().toISOString().slice(0, 10), amount: -23.4, currency_code: "EUR", description: "REWE Markt", category: "groceries", status: "posted" },
      { id: 2, account_id: checking.external_account_id, made_on: new Date().toISOString().slice(0, 10), amount: -10, currency_code: "EUR", description: "Online Casino", category: "gambling", status: "posted" },
      { id: 3, account_id: checking.external_account_id, made_on: new Date().toISOString().slice(0, 10), amount: 1200, currency_code: "EUR", description: "Gehalt", category: "salary", status: "posted" },
      { id: 4, account_id: checking.external_account_id, made_on: new Date().toISOString().slice(0, 10), amount: -5, currency_code: "EUR", description: "Kiosk", category: "shopping", status: "pending" },
      { id: 5, account_id: checking.external_account_id, made_on: new Date().toISOString().slice(0, 10), amount: -23.4, currency_code: "EUR", description: "REWE Markt", category: "groceries", duplicated: true },
    ]);
    expect((await share(c.dependent, checking.id)).error).toBeNull();
    expect((await sync(c.dependent, { connectionId: c.conn.id })).body).toMatchObject({ status: "active", inserted: 4 });
    expect(await stored(checking.id)).toEqual([
      { external_id: "1", amount: "2340", direction: "expense", category: "Groceries", currency: "EUR", status: "posted" },
      { external_id: "2", amount: "1000", direction: "expense", category: "Betting & lotteries", currency: "EUR", status: "posted" },
      { external_id: "3", amount: "120000", direction: "income", category: "Income", currency: "EUR", status: "posted" },
      { external_id: "4", amount: "500", direction: "expense", category: "Shopping", currency: "EUR", status: "pending" },
    ]);
  });

  it("refuses a connection of someone else's customer", async () => {
    const a = await saltEdgeConnected();
    const b = await sharing(db);
    await token(b.dependent, { country: "JP" });
    const res = await sync(b.dependent, { connectionId: a.conn.id });
    expect(res.status).toBe(404);
  });

  it("callbacks: only signed by Salt Edge; success reads, destroy forgets", async () => {
    const c = await saltEdgeConnected();
    expect((await seHook("success", { connection_id: c.ext, customer_id: c.customerId }, "bm90IGEgc2lnbmF0dXJl")).status).toBe(401);
    expect((await read(saltedgeWebhook(new Request("https://flow.test/functions/v1/saltedge-webhook?type=success", { method: "POST", body: "{}" }), { ...env(), saltedgeCallbackPublicKey: "" }, makeFor(db), fetcher))).status).toBe(401);

    se.connections.get(c.ext)!.status = "inactive";
    expect((await seHook("success", { connection_id: c.ext, customer_id: c.customerId })).body).toMatchObject({ outcome: "synced:needs_attention:0" });
    expect((await seHook("destroy", { connection_id: c.ext, customer_id: c.customerId })).body).toMatchObject({ outcome: "forgotten" });
    expect(await connOf("saltedge", c.ext)).toBeUndefined();
  });

  it("disconnecting removes it at Salt Edge", async () => {
    const c = await saltEdgeConnected();
    const res = await read(deleteConnection(post("bank-connection-delete", { connectionId: c.conn.id }, { as: c.dependent }), env(), makeFor(db), fetcher));
    expect(res.body).toEqual({ removed: true, providerPending: false });
    expect(se.removed).toContain(c.ext);
  });

  it("maps account kinds, skipping investments", () => {
    expect(saltEdgeAccountRow({ id: "1", connection_id: "c", name: "Savings", nature: "savings", currency_code: "GBP" })).toMatchObject({ kind: "savings", currency: "GBP" });
    expect(saltEdgeAccountRow({ id: "2", connection_id: "c", name: "Loan", nature: "loan", currency_code: "GBP" })).toBeNull();
  });
});

describe("deleting an account with banks outside Brazil", () => {
  it("ends the Plaid and Salt Edge connections at their providers and leaves nothing of the person", async () => {
    const c = await plaidConnected();
    const start = await token(c.dependent, { country: "JP" });
    const [customerId] = [...se.customers.keys()].filter((id) => se.customers.get(id) === c.dependent);
    const ext = se.connect(customerId);
    await sync(c.dependent, { session: start.body.session });

    const res = await read(
      deleteAccount(post("delete-account", { password: PASSWORD }, { as: c.dependent }), { url: ENV.url, anon: ENV.anon, service: ENV.service }, makeFor(db), fetcher),
    );
    expect(res).toEqual({ status: 200, body: { deleted: true } });
    expect(plaid.items.get(c.itemId)!.removed).toBe(true);
    expect(se.removed).toContain(ext);
    for (const table of ["bank_connections", "bank_customers", "bank_link_sessions"]) {
      expect(await db.admin(`select 1 from public.${table} where user_id = $1`, [c.dependent]), table).toHaveLength(0);
    }
    expect(await db.admin("select 1 from public.bank_item_tombstones where external_item_id in ($1, $2)", [c.itemId, ext])).toHaveLength(0);
  });
});

describe("crypto", () => {
  it("seals with a fresh IV each time and opens only with the key", async () => {
    const a = await sealSecret("access-production-123", TOKEN_KEY);
    const b = await sealSecret("access-production-123", TOKEN_KEY);
    expect(a).not.toBe(b);
    expect(await openSecret(a, TOKEN_KEY)).toBe("access-production-123");
    await expect(openSecret(a, b64encode(new Uint8Array(32).fill(9)))).rejects.toThrow();
  });

  it("a Plaid JWT is checked against the body and the clock", async () => {
    const jwk = { ...(await crypto.subtle.exportKey("jwk", ecKeys.publicKey)), kid: "k" } as never;
    const body = '{"a":1}';
    expect(await verifyPlaidJwt(await plaidSigned(body), jwk, body)).toBe(true);
    expect(await verifyPlaidJwt(await plaidSigned(body), jwk, '{"a":2}')).toBe(false);
  });
});
