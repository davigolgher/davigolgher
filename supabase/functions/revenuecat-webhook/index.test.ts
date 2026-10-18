/**
 * The RevenueCat webhook against a fake `billing` table: who may call it, and
 * which account each event changes.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { handle, type Env } from "./index";

const ENV: Env = { url: "https://example.supabase.co", service: "service-key", secret: "whsec-long-random-value" };
const DAY = 86_400_000;
const NOW = Date.now();

interface Row {
  user_id: string;
  status: string;
  updated_at: string;
  current_period_end: string | null;
}

let rows: Map<string, Row>;
let calls: number;
/** Accounts that exist; a write for any other fails the foreign key. */
let accounts: Set<string>;

function fakeClient() {
  return {
    from() {
      calls += 1;
      return {
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => ({ data: rows.get(id) ?? null, error: null }),
          }),
        }),
        upsert: async (row: Row) => {
          if (!accounts.has(row.user_id)) return { error: { code: "23503", message: "violates foreign key" } };
          rows.set(row.user_id, row);
          return { error: null };
        },
      };
    },
  };
}

function send(event: Record<string, unknown>, init: { auth?: string; method?: string; env?: Env } = {}) {
  const req = new Request("https://example.supabase.co/functions/v1/revenuecat-webhook", {
    method: init.method ?? "POST",
    headers: { Authorization: init.auth ?? ENV.secret, "content-type": "application/json" },
    body: (init.method ?? "POST") === "POST" ? JSON.stringify({ event }) : undefined,
  });
  return handle(req, init.env ?? ENV, fakeClient);
}

beforeEach(() => {
  rows = new Map();
  calls = 0;
  accounts = new Set(["user-a", "user-b"]);
});

describe("revenuecat-webhook — who may call it", () => {
  it("refuses a caller without the secret, before touching the database", async () => {
    const res = await send({ type: "INITIAL_PURCHASE", app_user_id: "user-a" }, { auth: "Bearer guess" });
    expect(res.status).toBe(401);
    expect(calls).toBe(0);
    expect(rows.size).toBe(0);
  });

  it("fails closed, and says nothing about why, when the secret isn't configured", async () => {
    const res = await send({ type: "INITIAL_PURCHASE", app_user_id: "user-a" }, { auth: "", env: { ...ENV, secret: "" } });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(/SECRET|SERVICE_ROLE|SUPABASE/);
    expect(rows.size).toBe(0);
  });

  it("only takes POST", async () => {
    expect((await send({}, { method: "GET" })).status).toBe(405);
  });
});

describe("revenuecat-webhook — which account changes", () => {
  it("records a purchase on the buyer's account", async () => {
    const res = await send({
      type: "INITIAL_PURCHASE",
      app_user_id: "user-a",
      product_id: "flow.yearly",
      expiration_at_ms: NOW + 365 * DAY,
      event_timestamp_ms: NOW,
    });
    expect(res.status).toBe(200);
    expect(rows.get("user-a")?.status).toBe("active");
  });

  it("a transfer takes access away from the account the subscription left", async () => {
    await send({ type: "RENEWAL", app_user_id: "user-a", expiration_at_ms: NOW + 20 * DAY, event_timestamp_ms: NOW - DAY });
    expect(rows.get("user-a")?.status).toBe("active");

    // Restored on user-b with the same Apple ID: RevenueCat moves it.
    const res = await send({ type: "TRANSFER", transferred_from: ["user-a"], transferred_to: ["user-b"], event_timestamp_ms: NOW });
    expect(res.status).toBe(200);
    expect(rows.get("user-a")?.status).toBe("inactive");
    // user-b gets its row from the next event about it, not from the transfer.
    expect(rows.has("user-b")).toBe(false);
  });

  it("ignores anonymous ids, which belong to no account", async () => {
    await send({ type: "TRANSFER", transferred_from: ["$RCAnonymousID:abc"], transferred_to: ["user-b"], event_timestamp_ms: NOW });
    await send({ type: "INITIAL_PURCHASE", app_user_id: "$RCAnonymousID:abc", expiration_at_ms: NOW + DAY });
    expect(rows.size).toBe(0);
  });

  it("acknowledges an event for a deleted account instead of failing it forever", async () => {
    const res = await send({ type: "RENEWAL", app_user_id: "deleted-user", expiration_at_ms: NOW + DAY, event_timestamp_ms: NOW });
    expect(res.status).toBe(200);
    expect(rows.size).toBe(0);
  });

  it("never lets an older event roll the state back", async () => {
    await send({ type: "EXPIRATION", app_user_id: "user-a", event_timestamp_ms: NOW });
    await send({ type: "RENEWAL", app_user_id: "user-a", expiration_at_ms: NOW + 30 * DAY, event_timestamp_ms: NOW - DAY });
    expect(rows.get("user-a")?.status).toBe("inactive");
  });
});
