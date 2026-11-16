// @vitest-environment node
/**
 * Product events (0018): the app can record how it is used, only for the
 * signed-in person, only known names and small properties, and nobody can
 * read them back but the service role. The team's read-outs (funnel,
 * retention, time to value) are computed from them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type TestDb } from "./harness";
import { user } from "./fixtures";

let db: TestDb;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const ev = (name: string, props: Record<string, unknown> = {}, msAgo = 0) => ({
  name,
  props,
  occurred_at: at(msAgo),
  session_id: "11111111-1111-4111-8111-111111111111",
  install_id: "22222222-2222-4222-8222-222222222222",
});
const DAY = 86_400_000;

describe("recording", () => {
  it("stores known events for me, with only the allowed properties, short", async () => {
    const me = await user(db, "events");
    const res = await db.as(me).rpc<number>("product_events_record", {
      p_events: [
        ev("onboarding_step_viewed", { step: "goals", merchant: "Netflix", amount: 3990, note: "x" }),
        ev("bank_import_completed", { banks: 1, entries: 128, country: "BR-and-a-very-long-string-that-is-cut-short-here" }),
        ev("something_made_up"),
      ],
      p_platform: "ios",
      p_app_version: "1.0.0",
    });
    expect(res.data).toBe(2);
    const rows = await db.admin<{ name: string; props: Record<string, unknown>; platform: string }>(
      "select name, props, platform from public.product_events where user_id = $1 order by id",
      [me],
    );
    expect(rows.map((r) => r.name)).toEqual(["onboarding_step_viewed", "bank_import_completed"]);
    expect(rows[0].props).toEqual({ step: "goals" });
    expect(String(rows[1].props.country)).toHaveLength(40);
    expect(rows[0].platform).toBe("ios");
  });

  it("drops times outside the last 30 days, and caps a day at 2,000 per account", async () => {
    const me = await user(db, "flood");
    expect((await db.as(me).rpc("product_events_record", { p_events: [ev("app_opened", {}, 40 * DAY), ev("app_opened", {}, -DAY)] })).data).toBe(0);
    await db.admin(
      "insert into public.product_events (user_id, name, occurred_at) select $1, 'app_opened', now() from generate_series(1, 1999)",
      [me],
    );
    expect((await db.as(me).rpc("product_events_record", { p_events: [ev("app_opened"), ev("app_opened"), ev("app_opened")] })).data).toBe(1);
  });

  it("nobody reads events back through the API, and nobody signed out can write", async () => {
    const me = await user(db, "reader");
    await db.as(me).rpc("product_events_record", { p_events: [ev("app_opened")] });
    expect((await db.as(me).from("product_events").select("id")).error?.code).toBe("42501");
    expect((await db.anon().rpc("product_events_record", { p_events: [ev("app_opened")] })).error?.code).toBe("42501");
    for (const fn of ["analytics_retention", "product_events_purge"]) {
      expect((await db.as(me).rpc(fn, {})).error?.code, fn).toBe("42501");
    }
  });

  it("goes with the account, and after 13 months", async () => {
    const me = await user(db, "leaver");
    await db.admin("insert into public.product_events (user_id, name, occurred_at) values ($1, 'app_opened', now() - interval '14 months')", [me]);
    await db.admin("insert into public.product_events (user_id, name, occurred_at) values ($1, 'app_opened', now())", [me]);
    expect((await db.service().rpc<number>("product_events_purge", {})).data).toBeGreaterThanOrEqual(1);
    expect(await db.admin("select 1 from public.product_events where user_id = $1", [me])).toHaveLength(1);
    await db.admin("delete from auth.users where id = $1", [me]);
    expect(await db.admin("select 1 from public.product_events where user_id = $1", [me])).toHaveLength(0);
  });
});

describe("read-outs", () => {
  it("the funnel, time to value and retention follow what people did", async () => {
    const insert = (u: string, name: string, msAgo: number) =>
      db.admin("insert into public.product_events (user_id, name, occurred_at) values ($1, $2, now() - ($3 || ' milliseconds')::interval)", [u, name, String(msAgo)]);
    const a = await user(db, "cohort-a");
    const b = await user(db, "cohort-b");
    // a: signs up 10 days ago, connects a bank 2 minutes later, sees the aha, comes back on day 1 and 7.
    await insert(a, "signup_completed", 10 * DAY);
    await insert(a, "onboarding_completed", 10 * DAY - 60_000);
    await insert(a, "paywall_converted", 10 * DAY - 90_000);
    await insert(a, "bank_import_completed", 10 * DAY - 120_000);
    await insert(a, "aha_reached", 10 * DAY - 130_000);
    await insert(a, "app_opened", 9 * DAY);
    await insert(a, "app_opened", 3 * DAY);
    // b: signs up and never gets further.
    await insert(b, "signup_completed", 10 * DAY);

    const from = new Date(Date.now() - 11 * DAY).toISOString();
    const to = new Date(Date.now() - 9.5 * DAY).toISOString();
    const funnel = await db.service().rpc<{ name: string; users: number; pct_of_signups: number }[]>("analytics_activation_funnel", { p_from: from, p_to: to });
    expect(funnel.error).toBeNull();
    expect(funnel.data!.map((s) => [s.name, Number(s.users)])).toEqual([
      ["signed up", 2],
      ["finished onboarding", 1],
      ["subscribed", 1],
      ["first value", 1],
      ["aha", 1],
      ["came back in week 1", 1],
    ]);

    const ttv = await db.service().rpc<{ milestone: string; reached: number; median_seconds: number }[]>("analytics_time_to_value", { p_from: from, p_to: to });
    expect(ttv.data!.map((m) => [m.milestone, Number(m.reached), Number(m.median_seconds)])).toEqual([
      ["first value", 1, 120],
      ["aha", 1, 130],
    ]);

    const ret = await db.service().rpc<{ users: number; d1: number; d7: number; d30: number | null }[]>("analytics_retention", { p_weeks: 4 });
    expect(ret.error).toBeNull();
    const cohort = ret.data!.find((r) => Number(r.users) >= 2)!;
    expect(Number(cohort.d1)).toBeGreaterThan(0);
    expect(cohort.d30).toBeNull();
  });
});
