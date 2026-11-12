// @vitest-environment node
/**
 * The schema as it stands before Flow Family — every migration in
 * supabase/migrations, then the prepared 0009 and 0010 — applied to a real
 * Postgres and checked as each role. It is the automated form of
 * supabase/tests/isolation_probe.sql, and the floor the family migrations
 * must not lower.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type TestDb } from "./harness";

let db: TestDb;
let a: string;
let b: string;

const tx = (userId: string, description: string) => ({
  user_id: userId,
  amount: 1250,
  direction: "expense",
  description,
  category: "Food",
  date: new Date().toISOString(),
  currency: "USD",
});

beforeAll(async () => {
  db = await createDb({ prepared: ["0009", "0010"] });
  a = await db.createUser("a@example.test");
  b = await db.createUser("b@example.test");
  // 0010 needs a subscription to write; both accounts have one here.
  await db.admin(
    "insert into public.billing (user_id, status, current_period_end) values ($1, 'active', now() + interval '30 days'), ($2, 'active', now() + interval '30 days')",
    [a, b],
  );
  expect((await db.as(a).from("transactions").insert(tx(a, "A's lunch"))).error).toBeNull();
  expect((await db.as(b).from("transactions").insert(tx(b, "B's coffee"))).error).toBeNull();
});

afterAll(async () => {
  await db.close();
});

describe("the existing schema, as each role", () => {
  it("signing up creates the profile, preferences and total budget", async () => {
    const rows = await db.admin<{ n: number }>(
      "select (select count(*) from public.profiles where id = $1)::int + (select count(*) from public.preferences where user_id = $1)::int + (select count(*) from public.budgets where user_id = $1)::int as n",
      [a],
    );
    expect(rows[0].n).toBe(3);
  });

  it("an account reads only its own transactions", async () => {
    const mine = await db.as(a).from("transactions").select("description");
    expect(mine.data).toEqual([{ description: "A's lunch" }]);
    const theirs = await db.as(a).from("transactions").select("description").eq("user_id", b);
    expect(theirs.data).toEqual([]);
  });

  it("an account cannot write a row for someone else", async () => {
    const res = await db.as(a).from("transactions").insert(tx(b, "planted"));
    expect(res.error?.code).toBe("42501");
  });

  it("an account cannot change or delete someone else's row", async () => {
    await db.as(a).from("transactions").update({ description: "edited" }).eq("user_id", b);
    await db.as(a).from("transactions").delete().eq("user_id", b);
    const rows = await db.admin<{ description: string }>("select description from public.transactions where user_id = $1", [b]);
    expect(rows).toEqual([{ description: "B's coffee" }]);
  });

  it("no session reaches no table", async () => {
    for (const table of ["transactions", "subscriptions", "categories", "budgets", "preferences", "profiles", "billing", "activity_days"]) {
      const res = await db.anon().from(table).select("*");
      expect(res.error?.code, table).toBe("42501");
    }
  });

  it("billing is read-only for its owner", async () => {
    const read = await db.as(a).from("billing").select("status");
    expect(read.data).toEqual([{ status: "active" }]);
    const write = await db.as(a).from("billing").update({ status: "active", current_period_end: null }).eq("user_id", a);
    expect(write.error?.code).toBe("42501");
  });

  it("a write without a subscription is refused with 402 (0010)", async () => {
    const c = await db.createUser("c@example.test");
    const res = await db.as(c).from("transactions").insert(tx(c, "unpaid"));
    expect(res.status).toBe(402);
  });

  it("values the app can't show are refused (0009)", async () => {
    const res = await db.as(a).from("transactions").insert({ ...tx(a, "negative"), amount: -1 });
    expect(res.error?.code).toBe("23514");
  });
});
