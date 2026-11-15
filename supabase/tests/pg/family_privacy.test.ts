// @vitest-environment node
/**
 * 0015 against a real Postgres: connections nobody shares anymore, retention,
 * the person's export, and the scheduled housekeeping function.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Env, MakeClient } from "../../functions/_shared/http";
import { runMaintenance } from "../../functions/_shared/maintenance";
import { Pluggy, type Fetch } from "../../functions/_shared/pluggy";
import { handle as maintenanceFn } from "../../functions/family-maintenance/index";
import { createDb, type TestDb } from "./harness";
import { connectBank, entry, family, ingest, share, sharingWithBank, user, V } from "./fixtures";

let db: TestDb;

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

/** Pluggy as far as ending connections goes. */
function fakePluggy() {
  const deleted: string[] = [];
  let down = false;
  const fetcher: Fetch = async (input, init) => {
    if (down) return new Response("{}", { status: 503 });
    const url = new URL(input);
    if (url.pathname === "/auth") return Response.json({ apiKey: "k" });
    if ((init?.method ?? "GET") === "DELETE" && url.pathname.startsWith("/items/")) {
      deleted.push(decodeURIComponent(url.pathname.slice("/items/".length)));
      return new Response(null, { status: 204 });
    }
    return Response.json({ message: "not found" }, { status: 404 });
  };
  return {
    deleted,
    setDown: (v: boolean) => (down = v),
    client: new Pluggy({ clientId: "id", clientSecret: "secret", baseUrl: "https://api.pluggy.test" }, fetcher),
    fetcher,
  };
}

const orphanedAt = async (connectionId: string) =>
  (await db.admin<{ orphaned_at: string | null }>("select orphaned_at from public.bank_connections where id = $1", [connectionId]))[0]?.orphaned_at ?? null;

const force = () => db.service().rpc<Record<string, unknown>>("family_maintenance", { p_force: true });

describe("connections nobody shares", () => {
  it("are marked when the dependent stops sharing, store nothing new, and recover when they share again", async () => {
    const s = await sharingWithBank(db);
    expect(await orphanedAt(s.bank.connectionId)).toBeNull();

    expect((await db.as(s.dependent).rpc("family_consent_revoke", { p_family: s.familyId })).error).toBeNull();
    expect(await orphanedAt(s.bank.connectionId)).not.toBeNull();
    const res = await ingest(db, s.checking, [entry()]);
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ inserted: 0 });

    const renewed = await db
      .as(s.dependent)
      .rpc("family_consent_renew", { p_family: s.familyId, p_term_version: V, p_months: 12, p_confirm_adult: true });
    expect(renewed.error).toBeNull();
    expect(await orphanedAt(s.bank.connectionId)).toBeNull();
    expect((await ingest(db, s.checking, [entry()])).data).toMatchObject({ inserted: 1 });
  });

  it("a consent that runs out by the calendar is caught by the housekeeping", async () => {
    const s = await sharingWithBank(db);
    await db.admin("update public.family_consents set expires_at = now() - interval '1 minute' where dependent_id = $1", [s.dependent]);
    expect(await orphanedAt(s.bank.connectionId)).toBeNull();
    expect((await force()).error).toBeNull();
    expect(await orphanedAt(s.bank.connectionId)).not.toBeNull();
    const [consent] = await db.admin<{ status: string }>("select status from public.family_consents where dependent_id = $1", [s.dependent]);
    expect(consent.status).toBe("expired");
  });

  it("are ended at Pluggy and deleted 30 days later, not before", async () => {
    const s = await sharingWithBank(db);
    await ingest(db, s.checking, [entry()]);
    await db.as(s.dependent).rpc("family_leave", { p_family: s.familyId });
    const pluggy = fakePluggy();

    await runMaintenance(db.service(), pluggy.client, { force: true, limit: 100 });
    expect(pluggy.deleted).not.toContain(s.bank.itemId);

    await db.admin("update public.bank_connections set orphaned_at = now() - interval '31 days' where id = $1", [s.bank.connectionId]);
    const result = await runMaintenance(db.service(), pluggy.client, { force: true, limit: 100 });
    expect(result.ended).toBeGreaterThanOrEqual(1);
    expect(pluggy.deleted).toContain(s.bank.itemId);
    expect(await db.admin("select 1 from public.bank_connections where id = $1", [s.bank.connectionId])).toHaveLength(0);
    expect(await db.admin("select 1 from public.bank_transactions where user_id = $1", [s.dependent])).toHaveLength(0);
  });

  it("with Pluggy down, the data still goes and the connection waits in the queue", async () => {
    const s = await sharingWithBank(db);
    await db.as(s.dependent).rpc("family_leave", { p_family: s.familyId });
    await db.admin("update public.bank_connections set orphaned_at = now() - interval '31 days' where id = $1", [s.bank.connectionId]);
    const pluggy = fakePluggy();
    pluggy.setDown(true);
    const result = await runMaintenance(db.service(), pluggy.client, { force: true, limit: 100 });
    expect(result.deferred).toBeGreaterThanOrEqual(1);
    expect(await db.admin("select 1 from public.bank_connections where id = $1", [s.bank.connectionId])).toHaveLength(0);
    expect(await db.admin("select 1 from public.bank_item_tombstones where external_item_id = $1", [s.bank.itemId])).toHaveLength(1);

    pluggy.setDown(false);
    await runMaintenance(db.service(), pluggy.client, { force: true, limit: 100 });
    expect(pluggy.deleted).toContain(s.bank.itemId);
    expect(await db.admin("select 1 from public.bank_item_tombstones where external_item_id = $1", [s.bank.itemId])).toHaveLength(0);
  });
});

describe("retention", () => {
  it("removes old bank entries, alerts and spent invitations; keeps the rest", async () => {
    const s = await sharingWithBank(db, { paid: true });
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
    await ingest(db, s.checking, [entry({ external_id: "ancient", date: old }), entry({ external_id: "recent" })]);
    const inv = await db.as(s.guardian).rpc<{ invite_id: string }>("family_invite_create", { p_family: s.familyId, p_kind: "adult", p_label: "Leo" });
    expect(inv.error).toBeNull();
    await db.admin("update public.family_invites set expires_at = now() - interval '31 days' where id = $1", [inv.data!.invite_id]);

    expect((await force()).error).toBeNull();
    const left = await db.admin<{ external_id: string }>("select external_id from public.bank_transactions where account_id = $1", [s.checking]);
    expect(left.map((r) => r.external_id)).toEqual(["recent"]);
    expect(await db.admin("select 1 from public.family_invites where id = $1", [inv.data!.invite_id])).toHaveLength(0);
    // The invitation that was accepted stays: it's part of how consent was given.
    expect(await db.admin("select 1 from public.family_invites where family_id = $1 and status = 'accepted'", [s.familyId])).toHaveLength(1);
  });

  it("runs at most hourly unless forced", async () => {
    expect((await force()).error).toBeNull();
    const again = await db.service().rpc<{ skipped?: boolean }>("family_maintenance", {});
    expect(again.data?.skipped).toBe(true);
    expect((await force()).data).not.toHaveProperty("skipped");
  });

  it("is for the server only", async () => {
    const someone = await user(db, "someone");
    expect((await db.as(someone).rpc("family_maintenance", { p_force: true })).status).toBe(403);
    expect((await db.anon().rpc("family_maintenance", {})).status).toBe(403);
  });
});

describe("export", () => {
  const IP = { "cf-connecting-ip": "203.0.113.7", "user-agent": "FlowTest/1.0", "x-forwarded-for": "203.0.113.7, 10.0.0.1" };

  async function consentedWithIp() {
    const f = await family(db);
    const dependent = await user(db, "dependent");
    const inv = await db.as(f.guardian).rpc<{ code: string }>("family_invite_create", { p_family: f.familyId, p_kind: "adult", p_label: "Ana" });
    const acc = await db
      .as(dependent, IP)
      .rpc<{ ok: boolean }>("family_invite_accept", { p_code: inv.data!.code, p_display_name: "Ana", p_term_version: V, p_confirm_adult: true });
    expect(acc.data?.ok).toBe(true);
    const bank = await connectBank(db, dependent);
    await share(db, dependent, bank.accounts[0].id);
    await ingest(db, bank.accounts[0].id, [entry({ description: "Padaria Estrela", amount: 1234 })]);
    return { ...f, dependent, bank };
  }

  it("gives the dependent their consent record, with when and from where, and their bank data", async () => {
    const s = await consentedWithIp();
    const res = await db.as(s.dependent).rpc<Record<string, unknown[]>>("family_export_my_data", {});
    expect(res.error).toBeNull();
    const out = res.data as Record<string, any>;
    expect(out.format).toBe("flow-family-export/1");
    expect(out.consents_i_gave).toHaveLength(1);
    expect(out.consents_i_gave[0]).toMatchObject({ term_version: V, given_by: "self", granted_ip: "203.0.113.7", granted_user_agent: "FlowTest/1.0" });
    expect(out.bank_connections[0].accounts[0].transactions[0]).toMatchObject({ description: "Padaria Estrela", amount_cents: 1234 });
    expect(out.memberships[0]).toMatchObject({ role: "dependent", display_name: "Ana" });
  });

  it("the guardian's copy names the family, not the dependent's bank entries or network details", async () => {
    const s = await consentedWithIp();
    const res = await db.as(s.guardian).rpc("family_export_my_data", {});
    expect(res.error).toBeNull();
    const text = JSON.stringify(res.data);
    expect(text).not.toContain("203.0.113.7");
    expect(text).not.toContain("Padaria Estrela");
    expect(text).not.toContain("FlowTest/1.0");
    const out = res.data as Record<string, any>;
    expect(out.families_i_created[0].members.map((m: { display_name: string }) => m.display_name).sort()).toEqual(["Ana", "Maria"]);
    expect(out.consents_received[0]).toMatchObject({ dependent: "Ana", status: "active" });
    expect(out.bank_connections).toEqual([]);
  });

  it("is recorded, and only ever about the caller", async () => {
    const s = await consentedWithIp();
    const stranger = await user(db, "stranger");
    const res = await db.as(stranger).rpc<Record<string, unknown[]>>("family_export_my_data", {});
    expect(JSON.stringify(res.data)).not.toContain("Padaria Estrela");
    expect((await db.anon().rpc("family_export_my_data", {})).status).toBe(403);
    await db.as(s.dependent).rpc("family_export_my_data", {});
    const audit = await db.as(s.dependent).from("family_audit_log").select("action").eq("action", "data_exported");
    expect(audit.data).toHaveLength(1);
  });
});

describe("family-maintenance function", () => {
  const ENV: Env = {
    url: "https://flow.test",
    anon: "anon-key",
    service: "service-key",
    pluggyClientId: "id",
    pluggyClientSecret: "secret",
    pluggyBaseUrl: "https://api.pluggy.test",
    webhookSecret: "",
    expoAccessToken: "",
    pluggyIncludeSandbox: false,
    pluggyOauthRedirectUri: "",
    pluggySandboxUserIds: [],
  };
  const make: MakeClient = () => {
    const s = db.service();
    return { from: (t: string) => s.from(t), rpc: (f: string, a?: Record<string, unknown>) => s.rpc(f, a) };
  };
  const run = (authorization?: string) =>
    maintenanceFn(
      new Request("https://flow.test/functions/v1/family-maintenance", {
        method: "POST",
        headers: authorization ? { Authorization: authorization } : {},
      }),
      ENV,
      make,
      fakePluggy().fetcher,
    );

  it("runs only with the service role key", async () => {
    expect((await run()).status).toBe(401);
    expect((await run("Bearer anon-key")).status).toBe(401);
    expect((await run("Bearer a-users-jwt")).status).toBe(401);
    const ok = await run("Bearer service-key");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, skipped: false });
  });
});
