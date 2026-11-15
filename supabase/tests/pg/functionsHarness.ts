/**
 * What the Edge Function tests share: an Env with every provider off, Supabase
 * clients backed by the test database, and request helpers.
 */
import type { Env, MakeClient } from "../../functions/_shared/http";
import type { TestDb } from "./harness";

export const BASE_ENV: Env = {
  url: "https://flow.test",
  anon: "anon-key",
  service: "service-key",
  pluggyClientId: "",
  pluggyClientSecret: "",
  pluggyBaseUrl: "https://api.pluggy.test",
  webhookSecret: "",
  expoAccessToken: "",
  pluggyIncludeSandbox: false,
  pluggyOauthRedirectUri: "",
  sandboxUserIds: [],
  plaidClientId: "",
  plaidSecret: "",
  plaidEnvironment: "sandbox",
  plaidSandboxSecret: "",
  saltedgeAppId: "",
  saltedgeSecret: "",
  saltedgePrivateKey: "",
  saltedgeCallbackPublicKey: "",
  saltedgeCallbackUrl: "",
  saltedgeBaseUrl: "",
  bankTokenKey: "",
  bankReturnUrl: "flow://family/bank-return",
};

export const PASSWORD = "correct horse battery";

/**
 * Clients as the functions create them: service key → service role (with
 * auth.admin.deleteUser and storage); anon key + "Bearer jwt:<uid>" → that
 * user (with getUser and signInWithPassword against the test users).
 */
export function makeFor(db: TestDb): MakeClient {
  return (_url, key, options) => {
    if (key === BASE_ENV.service) {
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
}

export function post(path: string, body: unknown, opts: { as?: string; headers?: Record<string, string>; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...opts.headers };
  if (opts.as) headers.Authorization = `Bearer jwt:${opts.as}`;
  return new Request(`https://flow.test/functions/v1/${path}`, { method: "POST", headers, body: opts.raw ?? JSON.stringify(body) });
}

export async function read(res: Promise<Response> | Response) {
  const r = await res;
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}
