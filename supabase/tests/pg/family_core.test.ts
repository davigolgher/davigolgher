// @vitest-environment node
/**
 * 0011 — families, invitations, consent and the audit trail — against a real
 * Postgres, as each role. These are the access rules of the feature: who can
 * create what, what a consent records, and that ending it ends the access.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONSENT_TERM_VERSION, consentTermText } from "@/lib/family/consentTerm";
import { createDb, type FakeSupabase, type TestDb } from "./harness";

let db: TestDb;
let seq = 0;

const V = CONSENT_TERM_VERSION;
const IP = { "cf-connecting-ip": "203.0.113.7", "user-agent": "FlowTest/1.0", "x-forwarded-for": "203.0.113.7, 10.0.0.1" };

async function user(label: string): Promise<string> {
  seq += 1;
  return db.createUser(`${label}.${seq}@example.test`);
}

async function paid(userId: string): Promise<void> {
  await db.admin(
    "insert into public.billing (user_id, status, current_period_end) values ($1, 'active', now() + interval '30 days') on conflict (user_id) do update set status = 'active', current_period_end = now() + interval '30 days'",
    [userId],
  );
}

/** A guardian with a family. */
async function family(name = "The Silvas") {
  const guardian = await user("guardian");
  const res = await db.as(guardian).rpc<string>("family_create", { p_name: name, p_display_name: "Maria" });
  expect(res.error).toBeNull();
  return { guardian, familyId: res.data as string };
}

async function invite(
  guardian: string,
  familyId: string,
  args: Record<string, unknown> = {},
  client: FakeSupabase = db.as(guardian),
) {
  return client.rpc<{ invite_id: string; code: string; expires_at: string }>("family_invite_create", {
    p_family: familyId,
    p_kind: "adult",
    p_label: "Ana",
    ...args,
  });
}

/** A guardian, a family and an adult dependent who has consented. */
async function sharing(months = 12) {
  const f = await family();
  const dependent = await user("dependent");
  const inv = await invite(f.guardian, f.familyId);
  expect(inv.error).toBeNull();
  const acc = await db.as(dependent, IP).rpc<{ ok: boolean }>("family_invite_accept", {
    p_code: inv.data!.code,
    p_display_name: "Ana",
    p_term_version: V,
    p_months: months,
    p_confirm_adult: true,
  });
  expect(acc.error).toBeNull();
  expect(acc.data?.ok).toBe(true);
  return { ...f, dependent };
}

const canView = async (viewer: string, dependent: string) =>
  (await db.as(viewer).rpc<boolean>("family_can_view", { p_dependent: dependent })).data;

beforeAll(async () => {
  db = await createDb();
});

afterAll(async () => {
  await db.close();
});

describe("the consent term", () => {
  it("is recorded with the hash of the exact text the app shows", async () => {
    const rows = await db.admin<{ sha256: string }>("select sha256 from public.family_consent_terms where version = $1", [V]);
    expect(rows[0]?.sha256).toBe(createHash("sha256").update(consentTermText(), "utf8").digest("hex"));
  });
});

describe("who can reach the tables and functions", () => {
  const TABLES = ["families", "family_members", "family_invites", "family_consents", "family_consent_terms", "family_invite_attempts"];

  it("without a session: no table, no function", async () => {
    for (const t of [...TABLES, "family_audit_log"]) {
      expect((await db.anon().from(t).select("*")).error?.code, t).toBe("42501");
    }
    for (const [fn, args] of [
      ["family_my_state", {}],
      ["family_create", { p_name: "x", p_display_name: "y" }],
      ["family_invite_preview", { p_code: "ABCDEFGH" }],
      ["family_can_view", { p_dependent: "00000000-0000-0000-0000-000000000001" }],
    ] as const) {
      expect((await db.anon().rpc(fn, args)).error?.code, fn).toBe("42501");
    }
  });

  it("signed in: the tables are still closed — only the functions answer", async () => {
    const s = await sharing();
    for (const t of TABLES) {
      expect((await db.as(s.guardian).from(t).select("*")).error?.code, t).toBe("42501");
      expect((await db.as(s.dependent).from(t).select("*")).error?.code, t).toBe("42501");
    }
    const forged = await db.as(s.guardian).from("family_consents").insert({
      family_id: s.familyId,
      dependent_id: s.dependent,
      guardian_id: s.guardian,
      term_version: V,
      given_by: "self",
      months: 12,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(forged.error?.code).toBe("42501");
  });

  it("the helpers behind the functions can't be called directly", async () => {
    const u = await user("probe");
    for (const [fn, args] of [
      ["family_audit", { p_family: null, p_actor: u, p_subject: u, p_action: "forged" }],
      ["family_plan", { p_user: u }],
      ["family_end_consents", { p_family: null, p_dependent: u, p_reason: "expired", p_by: u }],
      ["family_guardian_can_view", { p_guardian: u, p_dependent: u }],
      ["family_new_code", {}],
    ] as const) {
      expect((await db.as(u).rpc(fn, args)).error?.code, fn).toBe("42501");
    }
  });
});

describe("creating a family and inviting", () => {
  it("one family per guardian", async () => {
    const f = await family();
    const again = await db.as(f.guardian).rpc("family_create", { p_name: "Second", p_display_name: "Maria" });
    expect(again.status).toBe(409);
    expect(again.error?.message).toBe("family_exists");
  });

  it("the code is 8 unambiguous characters, and only its hash is stored", async () => {
    const f = await family();
    const inv = await invite(f.guardian, f.familyId);
    expect(inv.data?.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    const rows = await db.admin<Record<string, unknown>>("select * from public.family_invites where id = $1", [inv.data!.invite_id]);
    expect(JSON.stringify(rows[0])).not.toContain(inv.data!.code);
    expect(rows[0].code_hash).toBe(createHash("sha256").update(inv.data!.code, "utf8").digest("hex"));
  });

  it("only the family's guardian can invite, revoke an invitation or remove someone", async () => {
    const s = await sharing();
    const stranger = await user("stranger");
    for (const who of [stranger, s.dependent]) {
      expect((await invite(who, s.familyId)).error?.message).toBe("not_a_guardian");
      expect(
        (await db.as(who).rpc("family_member_remove", { p_family: s.familyId, p_user: s.dependent })).error?.message,
      ).toBe("not_a_guardian");
      expect((await db.as(who).rpc("family_delete", { p_family: s.familyId })).error?.message).toBe("not_a_guardian");
      expect((await db.as(who).rpc("family_rename", { p_family: s.familyId, p_name: "Hacked" })).error?.message).toBe("not_a_guardian");
    }
    expect(await canView(s.guardian, s.dependent)).toBe(true);
  });

  it("free plan: one dependent, counting a pending invitation; paid: no limit", async () => {
    const f = await family();
    expect((await invite(f.guardian, f.familyId)).error).toBeNull();
    const second = await invite(f.guardian, f.familyId, { p_label: "Beto" });
    expect(second.status).toBe(402);
    expect(second.error?.message).toBe("plan_limit_dependents");
    await paid(f.guardian);
    expect((await invite(f.guardian, f.familyId, { p_label: "Beto" })).error).toBeNull();
  });

  it("refuses names that are empty once cleaned, and unknown kinds or periods", async () => {
    const f = await family();
    expect((await invite(f.guardian, f.familyId, { p_label: "  \u0007 " })).error?.message).toBe("invalid_name");
    expect((await invite(f.guardian, f.familyId, { p_kind: "spouse" })).error?.message).toBe("invalid_kind");
    expect((await invite(f.guardian, f.familyId, { p_months: 24 })).error?.message).toBe("invalid_months");
  });
});

describe("accepting an invitation", () => {
  it("shows who is inviting before anything is agreed, with the address masked", async () => {
    const f = await family("Casa");
    const inv = await invite(f.guardian, f.familyId);
    const d = await user("dependent");
    const preview = await db.as(d).rpc<Record<string, unknown>>("family_invite_preview", { p_code: inv.data!.code.toLowerCase() });
    expect(preview.data).toMatchObject({
      found: true,
      own_invite: false,
      family_name: "Casa",
      guardian_name: "Maria",
      kind: "adult",
      term_version: V,
    });
    expect(preview.data?.guardian_email).toMatch(/^g\*\*\*@example\.test$/);
  });

  it("a wrong code finds nothing; ten wrong codes an hour lock the account out", async () => {
    const d = await user("guesser");
    for (let i = 0; i < 10; i += 1) {
      const res = await db.as(d).rpc<{ found: boolean }>("family_invite_preview", { p_code: `WRONG${i}XX` });
      expect(res.data?.found).toBe(false);
    }
    const blocked = await db.as(d).rpc("family_invite_preview", { p_code: "WRONGAGN" });
    expect(blocked.status).toBe(429);
    // …even with a real code in hand.
    const f = await family();
    const inv = await invite(f.guardian, f.familyId);
    const real = await db.as(d).rpc("family_invite_accept", {
      p_code: inv.data!.code,
      p_display_name: "X",
      p_term_version: V,
      p_confirm_adult: true,
    });
    expect(real.status).toBe(429);
  });

  it("an adult must confirm being 18 or older, and agree to the current term", async () => {
    const f = await family();
    const inv = await invite(f.guardian, f.familyId);
    const d = await user("dependent");
    const base = { p_code: inv.data!.code, p_display_name: "Ana", p_term_version: V };
    expect((await db.as(d).rpc("family_invite_accept", base)).error?.message).toBe("adult_confirmation_required");
    expect(
      (await db.as(d).rpc("family_invite_accept", { ...base, p_term_version: "2020-01", p_confirm_adult: true })).error?.message,
    ).toBe("term_outdated");
    expect(await canView(f.guardian, d)).toBe(false);
  });

  it("records who consented, to whom, which version, when, from where and until when", async () => {
    const s = await sharing(6);
    const rows = await db.admin<Record<string, unknown>>(
      "select *, host(granted_ip) as ip, (expires_at - granted_at) as span from public.family_consents where dependent_id = $1",
      [s.dependent],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      guardian_id: s.guardian,
      family_id: s.familyId,
      term_version: V,
      given_by: "self",
      representative_id: null,
      months: 6,
      status: "active",
      ip: "203.0.113.7",
      granted_ip_chain: "203.0.113.7, 10.0.0.1",
      granted_user_agent: "FlowTest/1.0",
    });
    const months = await db.admin<{ ok: boolean }>(
      "select expires_at between now() + interval '6 months' - interval '1 minute' and now() + interval '6 months' + interval '1 minute' as ok from public.family_consents where dependent_id = $1",
      [s.dependent],
    );
    expect(months[0].ok).toBe(true);
  });

  it("a code works once, never for the person who made it, and not after it expires", async () => {
    const f = await family();
    await paid(f.guardian);
    const inv = await invite(f.guardian, f.familyId);
    const own = await db.as(f.guardian).rpc("family_invite_accept", {
      p_code: inv.data!.code,
      p_display_name: "Me",
      p_term_version: V,
      p_confirm_adult: true,
    });
    expect(own.error?.message).toBe("cannot_join_own_family");

    const d1 = await user("first");
    const d2 = await user("second");
    const args = { p_code: inv.data!.code, p_display_name: "Ana", p_term_version: V, p_confirm_adult: true };
    expect((await db.as(d1).rpc<{ ok: boolean }>("family_invite_accept", args)).data?.ok).toBe(true);
    expect((await db.as(d2).rpc<{ ok: boolean; reason: string }>("family_invite_accept", args)).data).toEqual({
      ok: false,
      reason: "invite_invalid",
    });

    const late = await invite(f.guardian, f.familyId, { p_label: "Late" });
    await db.admin("update public.family_invites set expires_at = now() - interval '1 minute' where id = $1", [late.data!.invite_id]);
    expect(
      (await db.as(d2).rpc<{ ok: boolean }>("family_invite_accept", { ...args, p_code: late.data!.code })).data?.ok,
    ).toBe(false);
    expect(await canView(f.guardian, d2)).toBe(false);
  });

  it("a revoked invitation can't be used", async () => {
    const f = await family();
    const inv = await invite(f.guardian, f.familyId);
    expect((await db.as(f.guardian).rpc("family_invite_revoke", { p_invite: inv.data!.invite_id })).error).toBeNull();
    const d = await user("dependent");
    const res = await db.as(d).rpc<{ ok: boolean }>("family_invite_accept", {
      p_code: inv.data!.code,
      p_display_name: "Ana",
      p_term_version: V,
      p_confirm_adult: true,
    });
    expect(res.data?.ok).toBe(false);
  });
});

describe("the access rule", () => {
  it("only the consented guardian can view — not a stranger, not another guardian, not the dependent in reverse", async () => {
    const s = await sharing();
    const stranger = await user("stranger");
    const other = await family("Others");
    expect(await canView(s.guardian, s.dependent)).toBe(true);
    expect(await canView(stranger, s.dependent)).toBe(false);
    expect(await canView(other.guardian, s.dependent)).toBe(false);
    expect(await canView(s.dependent, s.guardian)).toBe(false);
    expect(await canView(s.dependent, s.dependent)).toBe(false);
  });

  it("the dependent stops sharing and access ends at once", async () => {
    const s = await sharing();
    expect((await db.as(s.dependent).rpc("family_consent_revoke", { p_family: s.familyId })).error).toBeNull();
    expect(await canView(s.guardian, s.dependent)).toBe(false);
    const rows = await db.admin<Record<string, unknown>>(
      "select status, end_reason, ended_by from public.family_consents where dependent_id = $1",
      [s.dependent],
    );
    expect(rows).toEqual([{ status: "revoked", end_reason: "revoked_by_dependent", ended_by: s.dependent }]);
  });

  it("nobody else can stop it for them — or revoke someone else's consent", async () => {
    const s = await sharing();
    const stranger = await user("stranger");
    expect((await db.as(stranger).rpc("family_consent_revoke", { p_family: s.familyId })).error?.message).toBe("not_a_dependent");
    expect((await db.as(s.guardian).rpc("family_consent_revoke", { p_family: s.familyId })).error?.message).toBe("not_a_dependent");
    expect(await canView(s.guardian, s.dependent)).toBe(true);
  });

  it("access ends when the period runs out, without anyone doing anything", async () => {
    const s = await sharing(3);
    await db.admin("update public.family_consents set expires_at = now() - interval '1 second' where dependent_id = $1", [s.dependent]);
    expect(await canView(s.guardian, s.dependent)).toBe(false);
    const state = await db.as(s.guardian).rpc<{ guardian_of: { dependents: { consent: { status: string; end_reason: string } }[] } }>("family_my_state");
    expect(state.data?.guardian_of.dependents[0].consent).toMatchObject({ status: "expired", end_reason: "expired" });
  });

  it("access ends when the guardian removes the dependent, or the dependent leaves", async () => {
    const a = await sharing();
    expect((await db.as(a.guardian).rpc("family_member_remove", { p_family: a.familyId, p_user: a.dependent })).error).toBeNull();
    expect(await canView(a.guardian, a.dependent)).toBe(false);

    const b = await sharing();
    expect((await db.as(b.dependent).rpc("family_leave", { p_family: b.familyId })).error).toBeNull();
    expect(await canView(b.guardian, b.dependent)).toBe(false);
    const state = await db.as(b.dependent).rpc<{ dependent_of: unknown[] }>("family_my_state");
    expect(state.data?.dependent_of).toEqual([]);
  });

  it("if the subscription lapses, the first dependent stays visible and the rest are locked, not removed", async () => {
    const f = await family();
    await paid(f.guardian);
    const dependents: string[] = [];
    for (const label of ["Ana", "Beto"]) {
      const d = await user(label);
      const inv = await invite(f.guardian, f.familyId, { p_label: label });
      await db.as(d).rpc("family_invite_accept", { p_code: inv.data!.code, p_display_name: label, p_term_version: V, p_confirm_adult: true });
      dependents.push(d);
      // Distinct join times, so "first" is unambiguous.
      await db.admin("update public.family_members set joined_at = now() - make_interval(mins => $2) where user_id = $1", [d, 10 - dependents.length]);
    }
    expect(await canView(f.guardian, dependents[0])).toBe(true);
    expect(await canView(f.guardian, dependents[1])).toBe(true);

    await db.admin("update public.billing set status = 'inactive' where user_id = $1", [f.guardian]);
    expect(await canView(f.guardian, dependents[0])).toBe(true);
    expect(await canView(f.guardian, dependents[1])).toBe(false);
    const state = await db.as(f.guardian).rpc<{ guardian_of: { plan: string; dependents: { locked: boolean }[] } }>("family_my_state");
    expect(state.data?.guardian_of.plan).toBe("free");
    expect(state.data?.guardian_of.dependents.map((d) => d.locked)).toEqual([false, true]);

    await paid(f.guardian);
    expect(await canView(f.guardian, dependents[1])).toBe(true);
  });
});

describe("minors and people with a legal representative", () => {
  const birthdate = (yearsAgo: number, extraDays = 0) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - yearsAgo);
    d.setDate(d.getDate() + extraDays);
    return d.toISOString().slice(0, 10);
  };

  it("inviting a minor needs a birth date under 18 and the representative's declaration", async () => {
    const f = await family();
    const minor = { p_kind: "minor", p_label: "Leo", p_term_version: V };
    expect((await invite(f.guardian, f.familyId, { ...minor, p_rep_declared: true })).error?.message).toBe("invalid_birthdate");
    expect(
      (await invite(f.guardian, f.familyId, { ...minor, p_rep_declared: true, p_birthdate: birthdate(19) })).error?.message,
    ).toBe("invalid_birthdate");
    expect((await invite(f.guardian, f.familyId, { ...minor, p_birthdate: birthdate(12) })).error?.message).toBe(
      "representative_declaration_required",
    );
    expect(
      (await invite(f.guardian, f.familyId, { ...minor, p_rep_declared: true, p_birthdate: birthdate(12), p_term_version: "old" })).error
        ?.message,
    ).toBe("term_outdated");
    // An adult invitation carries no birth date.
    expect((await invite(f.guardian, f.familyId, { p_birthdate: birthdate(30) })).error?.message).toBe("invalid_birthdate");
  });

  it("the consent is the representative's, recorded with theirs and the minor's confirmation", async () => {
    const f = await family();
    const born = birthdate(12);
    const inv = await invite(
      f.guardian,
      f.familyId,
      { p_kind: "minor", p_label: "Leo", p_birthdate: born, p_rep_declared: true, p_term_version: V, p_months: 6 },
      db.as(f.guardian, { "cf-connecting-ip": "198.51.100.20", "user-agent": "GuardianPhone" }),
    );
    expect(inv.error).toBeNull();
    const minor = await user("minor");
    const wrong = await db.as(minor).rpc("family_invite_accept", {
      p_code: inv.data!.code,
      p_display_name: "Leo",
      p_term_version: V,
      p_birthdate: birthdate(13),
    });
    expect(wrong.error?.message).toBe("birthdate_mismatch");
    const ok = await db.as(minor, IP).rpc<{ ok: boolean }>("family_invite_accept", {
      p_code: inv.data!.code,
      p_display_name: "Leo",
      p_term_version: V,
      p_birthdate: born,
      // A minor can't pick a different period than their representative did.
      p_months: 12,
    });
    expect(ok.data?.ok).toBe(true);
    const rows = await db.admin<Record<string, unknown>>(
      "select given_by, representative_id, months, host(rep_ip) as rep_ip, rep_user_agent, host(granted_ip) as ip, rep_consented_at is not null as rep_at from public.family_consents where dependent_id = $1",
      [minor],
    );
    expect(rows[0]).toEqual({
      given_by: "legal_representative",
      representative_id: f.guardian,
      months: 6,
      rep_ip: "198.51.100.20",
      rep_user_agent: "GuardianPhone",
      ip: "203.0.113.7",
      rep_at: true,
    });
    expect(await canView(f.guardian, minor)).toBe(true);
  });

  it("a minor's consent can't outlast their 18th birthday, and then only they can renew it", async () => {
    const f = await family();
    const born = birthdate(18, 20); // turns 18 in 20 days
    const inv = await invite(f.guardian, f.familyId, { p_kind: "minor", p_label: "Bia", p_birthdate: born, p_rep_declared: true, p_term_version: V });
    const minor = await user("minor");
    await db.as(minor).rpc("family_invite_accept", { p_code: inv.data!.code, p_display_name: "Bia", p_term_version: V, p_birthdate: born });
    const span = await db.admin<{ days: number }>(
      "select extract(day from expires_at - now())::int as days from public.family_consents where dependent_id = $1",
      [minor],
    );
    expect(span[0].days).toBeLessThanOrEqual(20);

    // The birthday passes.
    await db.admin("update public.family_members set birthdate = birthdate - 30 where user_id = $1", [minor]);
    await db.admin("update public.family_consents set expires_at = now() - interval '1 day' where dependent_id = $1", [minor]);
    expect(await canView(f.guardian, minor)).toBe(false);
    const rep = await db.as(f.guardian).rpc("family_consent_renew_as_representative", {
      p_family: f.familyId,
      p_dependent: minor,
      p_term_version: V,
      p_months: 12,
      p_rep_declared: true,
    });
    expect(rep.error?.message).toBe("dependent_must_consent");

    const self = await db.as(minor).rpc("family_consent_renew", { p_family: f.familyId, p_term_version: V, p_months: 3, p_confirm_adult: true });
    expect(self.error).toBeNull();
    expect(await canView(f.guardian, minor)).toBe(true);
    const member = await db.admin<Record<string, unknown>>("select kind, birthdate from public.family_members where user_id = $1", [minor]);
    expect(member[0]).toEqual({ kind: "adult", birthdate: null });
    const reasons = await db.admin<{ end_reason: string | null }>(
      "select end_reason from public.family_consents where dependent_id = $1 order by created_at",
      [minor],
    );
    expect(reasons.map((r) => r.end_reason)).toEqual(["came_of_age", null]);
  });

  it("a minor can stop sharing themselves, and the representative can't quietly turn it back on", async () => {
    const f = await family();
    const born = birthdate(15);
    const inv = await invite(f.guardian, f.familyId, { p_kind: "minor", p_label: "Caio", p_birthdate: born, p_rep_declared: true, p_term_version: V });
    const minor = await user("minor");
    await db.as(minor).rpc("family_invite_accept", { p_code: inv.data!.code, p_display_name: "Caio", p_term_version: V, p_birthdate: born });
    // While in force, or just expired, the representative may extend it.
    const renewArgs = { p_family: f.familyId, p_dependent: minor, p_term_version: V, p_months: 12, p_rep_declared: true };
    expect((await db.as(f.guardian).rpc("family_consent_renew_as_representative", renewArgs)).error).toBeNull();
    expect((await db.as(minor).rpc("family_consent_renew", { p_family: f.familyId, p_term_version: V, p_months: 3, p_confirm_adult: true })).error?.message).toBe(
      "representative_required",
    );

    expect((await db.as(minor).rpc("family_consent_revoke", { p_family: f.familyId })).error).toBeNull();
    expect(await canView(f.guardian, minor)).toBe(false);
    expect((await db.as(f.guardian).rpc("family_consent_renew_as_representative", renewArgs)).error?.message).toBe("new_invite_required");
    expect(await canView(f.guardian, minor)).toBe(false);
  });

  it("a ward follows the same rules, without a birth date", async () => {
    const f = await family();
    expect((await invite(f.guardian, f.familyId, { p_kind: "ward", p_label: "Dona Rosa", p_term_version: V })).error?.message).toBe(
      "representative_declaration_required",
    );
    const inv = await invite(f.guardian, f.familyId, { p_kind: "ward", p_label: "Dona Rosa", p_rep_declared: true, p_term_version: V });
    const ward = await user("ward");
    const ok = await db.as(ward).rpc<{ ok: boolean }>("family_invite_accept", { p_code: inv.data!.code, p_display_name: "Rosa", p_term_version: V });
    expect(ok.data?.ok).toBe(true);
    const rows = await db.admin<Record<string, unknown>>("select given_by from public.family_consents where dependent_id = $1", [ward]);
    expect(rows[0].given_by).toBe("legal_representative");
  });
});

describe("renewing, as an adult", () => {
  it("keeps the old consent as history and starts a new one", async () => {
    const s = await sharing(3);
    await db.as(s.dependent).rpc("family_consent_revoke", { p_family: s.familyId });
    const again = await db.as(s.dependent, IP).rpc("family_consent_renew", { p_family: s.familyId, p_term_version: V, p_months: 12, p_confirm_adult: true });
    expect(again.error).toBeNull();
    expect(await canView(s.guardian, s.dependent)).toBe(true);
    const rows = await db.admin<{ status: string; months: number }>(
      "select status, months from public.family_consents where dependent_id = $1 order by created_at",
      [s.dependent],
    );
    expect(rows).toEqual([
      { status: "revoked", months: 3 },
      { status: "active", months: 12 },
    ]);
  });

  it("the guardian can't renew for an adult", async () => {
    const s = await sharing();
    const res = await db.as(s.guardian).rpc("family_consent_renew_as_representative", {
      p_family: s.familyId,
      p_dependent: s.dependent,
      p_term_version: V,
      p_months: 12,
      p_rep_declared: true,
    });
    expect(res.error?.message).toBe("dependent_must_consent");
  });
});

describe("the state each person is given", () => {
  it("the guardian sees their dependents and invitations; the dependent sees who is watching", async () => {
    const s = await sharing();
    const g = await db.as(s.guardian).rpc<Record<string, any>>("family_my_state");
    expect(g.data?.guardian_of.family.name).toBe("The Silvas");
    expect(g.data?.guardian_of.dependents).toHaveLength(1);
    expect(g.data?.guardian_of.dependents[0]).toMatchObject({ user_id: s.dependent, display_name: "Ana", kind: "adult", locked: false });
    expect(g.data?.guardian_of.dependents[0].consent.status).toBe("active");
    expect(g.data?.dependent_of).toEqual([]);

    const d = await db.as(s.dependent).rpc<Record<string, any>>("family_my_state");
    expect(d.data?.guardian_of).toBeNull();
    expect(d.data?.dependent_of).toHaveLength(1);
    expect(d.data?.dependent_of[0].guardians[0]).toMatchObject({ user_id: s.guardian, display_name: "Maria" });
    expect(d.data?.dependent_of[0].can_self_consent).toBe(true);
    // Nothing that identifies where either party connected from.
    expect(JSON.stringify(g.data) + JSON.stringify(d.data)).not.toMatch(/203\.0\.113|granted_ip|rep_ip|user_agent/);
  });

  it("someone outside the family is given nothing about it", async () => {
    await sharing();
    const stranger = await user("stranger");
    const st = await db.as(stranger).rpc<Record<string, unknown>>("family_my_state");
    expect(st.data).toMatchObject({ guardian_of: null, dependent_of: [] });
  });
});

describe("the audit trail", () => {
  it("each person reads the entries about them or by them, and no one else's", async () => {
    const s = await sharing();
    await db.as(s.dependent).rpc("family_consent_revoke", { p_family: s.familyId });
    const stranger = await user("stranger");

    const mine = await db.as(s.dependent).from("family_audit_log").select("action,actor_name").order("id");
    expect((mine.data as { action: string }[]).map((r) => r.action)).toEqual(["consent_granted", "consent_ended"]);

    const guardians = await db.as(s.guardian).from("family_audit_log").select("action").order("id");
    expect((guardians.data as { action: string }[]).map((r) => r.action)).toEqual(["family_created", "invite_created"]);

    expect((await db.as(stranger).from("family_audit_log").select("*")).data).toEqual([]);
  });

  it("can't be written, changed or erased from the app", async () => {
    const s = await sharing();
    const client = db.as(s.guardian);
    expect((await client.from("family_audit_log").insert({ subject_id: s.dependent, action: "forged" })).error?.code).toBe("42501");
    expect((await client.from("family_audit_log").update({ action: "edited" }).eq("subject_id", s.guardian)).error?.code).toBe("42501");
    expect((await client.from("family_audit_log").delete().eq("subject_id", s.guardian)).error?.code).toBe("42501");
  });
});

describe("when a family or an account goes away", () => {
  it("deleting the family ends every consent and tells each dependent", async () => {
    const s = await sharing();
    expect((await db.as(s.guardian).rpc("family_delete", { p_family: s.familyId })).error).toBeNull();
    expect(await canView(s.guardian, s.dependent)).toBe(false);
    const log = await db.as(s.dependent).from("family_audit_log").select("action,detail").order("id");
    const last = (log.data as { action: string; detail: { reason: string } }[]).at(-1);
    expect(last).toMatchObject({ action: "consent_ended", detail: { reason: "family_deleted" } });
    const left = await db.admin<{ n: number }>("select count(*)::int as n from public.family_consents where family_id = $1", [s.familyId]);
    expect(left[0].n).toBe(0);
  });

  it("deleting the guardian's account takes the family with it, and the dependent is told", async () => {
    const s = await sharing();
    await db.admin("delete from auth.users where id = $1", [s.guardian]);
    const left = await db.admin<{ n: number }>("select count(*)::int as n from public.families where id = $1", [s.familyId]);
    expect(left[0].n).toBe(0);
    const log = await db.as(s.dependent).from("family_audit_log").select("action,detail,actor_name").order("id");
    const last = (log.data as { action: string; detail: { reason: string }; actor_name: string }[]).at(-1);
    expect(last).toMatchObject({ action: "consent_ended", detail: { reason: "family_deleted" }, actor_name: "Maria" });
  });

  it("deleting the dependent's account removes their membership, consents and history", async () => {
    const s = await sharing();
    await db.admin("delete from auth.users where id = $1", [s.dependent]);
    const left = await db.admin<{ n: number }>(
      "select (select count(*) from public.family_members where user_id = $1)::int + (select count(*) from public.family_consents where dependent_id = $1)::int + (select count(*) from public.family_audit_log where subject_id = $1)::int as n",
      [s.dependent],
    );
    expect(left[0].n).toBe(0);
    const state = await db.as(s.guardian).rpc<{ guardian_of: { dependents: unknown[] } }>("family_my_state");
    expect(state.data?.guardian_of.dependents).toEqual([]);
  });
});
