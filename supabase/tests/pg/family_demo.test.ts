// @vitest-environment node
/**
 * The App Review demo seed, run against the real migrations: the guardian
 * sees a full dashboard, the dependent sees what they share, nothing is
 * duplicated on a second run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemoFamily, TERM_VERSION } from "../../scripts/demoFamily";
import { CONSENT_TERM_VERSION } from "@/lib/family/consentTerm";
import { createDb, type TestDb } from "./harness";
import { user } from "./fixtures";

let db: TestDb;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

describe("demo family", () => {
  it("consents under the current terms", () => {
    expect(TERM_VERSION).toBe(CONSENT_TERM_VERSION);
  });

  it("gives a reviewer a family with something on every screen, and is safe to run twice", async () => {
    const ids = { guardian: await user(db, "review-guardian"), dependent: await user(db, "review-dependent") };
    const clients = { admin: db.service(), as: (id: string) => db.as(id) };
    const now = new Date(2026, 10, 15, 18);

    const first = await seedDemoFamily(clients, ids, now);
    expect(first.accounts).toBe(2);
    expect(first.inserted).toBe(first.total);
    expect(first.total).toBeGreaterThan(25);

    const state = await db.as(ids.guardian).rpc<{ plan: string; guardian_of: { plan: string; dependents: { display_name: string; consent: { status: string } }[] } }>(
      "family_my_state",
      {},
    );
    expect(state.data?.guardian_of?.plan).toBe("paid");
    expect(state.data?.guardian_of?.dependents.map((d) => [d.display_name, d.consent.status])).toEqual([["Ana (demo)", "active"]]);

    const feed = await db.as(ids.guardian).rpc<unknown[]>("family_transactions", { p_dependent: ids.dependent });
    expect(feed.error).toBeNull();
    expect(feed.data!.length).toBe(first.total);

    const overview = await db.as(ids.guardian).rpc<{ budgets: unknown[]; rules: { kind: string; enabled: boolean }[]; accounts: { locked: boolean }[] }>(
      "family_dependent_overview",
      { p_dependent: ids.dependent },
    );
    expect(overview.data?.budgets).toHaveLength(3);
    expect(overview.data?.accounts.every((a) => !a.locked)).toBe(true);
    expect(overview.data?.rules.filter((r) => r.enabled).map((r) => r.kind).sort()).toEqual([
      "budget_exceeded",
      "connection_expired",
      "large_purchase",
      "sensitive_category",
    ]);

    // The dependent sees the access the guardian just made.
    const history = await db.as(ids.dependent).from("family_audit_log").select("action").eq("action", "viewed_transactions");
    expect(history.data).toHaveLength(1);

    const again = await seedDemoFamily(clients, ids, now);
    expect(again.inserted).toBe(0);
    expect((await db.as(ids.guardian).rpc<unknown[]>("family_transactions", { p_dependent: ids.dependent })).data!.length).toBe(first.total);
  });

  it("uses only fictitious names", async () => {
    const ids = { guardian: await user(db, "review-guardian"), dependent: await user(db, "review-dependent") };
    await seedDemoFamily({ admin: db.service(), as: (id: string) => db.as(id) }, ids, new Date(2026, 10, 15, 18));
    const rows = await db.admin<{ institution_name: string; external_item_id: string }>(
      "select institution_name, external_item_id from public.bank_connections where user_id = $1",
      [ids.dependent],
    );
    expect(rows[0].institution_name).toMatch(/fictício/);
    expect(rows[0].external_item_id).toMatch(/^demo-/);
  });
});
