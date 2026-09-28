/**
 * The delete-account function against fake Supabase clients: who gets to
 * delete, and what is erased when they do.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { handle, type Env } from "./index";

const ENV: Env = { url: "https://example.supabase.co", anon: "anon-key", service: "service-key" };
const USER = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.test" };
const PASSWORD = "correct horse battery";

interface World {
  /** Token → user, as the auth server would resolve it. */
  tokens: Map<string, typeof USER>;
  deletedRows: string[];
  deletedUsers: string[];
  signIns: number;
}

let world: World;

function fakeClient(_url: string, key: string, options?: { global?: { headers?: Record<string, string> } }) {
  const auth = (options?.global?.headers?.Authorization ?? "").replace(/^Bearer /, "");
  return {
    auth: {
      async getUser() {
        const user = world.tokens.get(auth);
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        world.signIns += 1;
        return email === USER.email && password === PASSWORD
          ? { data: { user: USER }, error: null }
          : { data: { user: null }, error: { message: "Invalid login credentials" } };
      },
      async signOut() {
        return { error: null };
      },
      admin: {
        async deleteUser(id: string) {
          if (key !== ENV.service) return { error: { message: "not admin" } };
          world.deletedUsers.push(id);
          return { error: null };
        },
      },
    },
    from(table: string) {
      return {
        delete: () => ({
          eq: async (_col: string, id: string) => {
            if (key !== ENV.service) return { error: { message: "RLS" } };
            world.deletedRows.push(`${table}:${id}`);
            return { error: null };
          },
        }),
      };
    },
    storage: { from: () => ({ list: async () => ({ data: [] }), remove: async () => ({}) }) },
  };
}

function call(init: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const req = new Request("https://example.supabase.co/functions/v1/delete-account", {
    method: init.method ?? "POST",
    headers,
    body: init.body === undefined || init.method === "GET" ? undefined : JSON.stringify(init.body),
  });
  return handle(req, ENV, fakeClient);
}

beforeEach(() => {
  world = { tokens: new Map([["token-a", USER]]), deletedRows: [], deletedUsers: [], signIns: 0 };
});

describe("delete-account", () => {
  it("refuses a request with no valid session", async () => {
    const res = await call({ token: "forged", body: { password: PASSWORD } });
    expect(res.status).toBe(401);
    expect(world.deletedUsers).toEqual([]);
  });

  it("refuses a session without the password — a stolen token isn't enough", async () => {
    const res = await call({ token: "token-a", body: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("password_required");
    expect(world.deletedRows).toEqual([]);
    expect(world.deletedUsers).toEqual([]);
  });

  it("refuses a wrong password and erases nothing", async () => {
    const res = await call({ token: "token-a", body: { password: "guess" } });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("wrong_password");
    expect(world.deletedRows).toEqual([]);
    expect(world.deletedUsers).toEqual([]);
  });

  it("never deletes on a GET", async () => {
    const res = await call({ method: "GET", token: "token-a" });
    expect(res.status).toBe(405);
    expect(world.signIns).toBe(0);
    expect(world.deletedUsers).toEqual([]);
  });

  it("with the right password, deletes the caller's rows and account — and only theirs", async () => {
    const res = await call({ token: "token-a", body: { password: PASSWORD, userId: "someone-else" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(world.deletedUsers).toEqual([USER.id]);
    expect(world.deletedRows.every((r) => r.endsWith(`:${USER.id}`))).toBe(true);
    expect(world.deletedRows).toHaveLength(7);
  });

  it("tells the caller nothing about its configuration", async () => {
    const res = await handle(
      new Request("https://x/functions/v1/delete-account", { method: "POST" }),
      { url: "", anon: "", service: "" },
      fakeClient,
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/SERVICE_ROLE|ANON_KEY|SUPABASE_URL/);
  });
});
