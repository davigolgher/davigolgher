/**
 * What every Flow Family function shares: environment, responses, the caller.
 *
 * Responses to the app carry a short code (`not_signed_in`, `plan_limit_…`)
 * and a plain sentence, never a raw database or provider error; the details go
 * to the function's log (OWASP ASVS V16).
 */

// deno-lint-ignore no-explicit-any
export type MakeClient = (url: string, key: string, options?: any) => any;

export interface Env {
  url: string;
  anon: string;
  service: string;
  pluggyClientId: string;
  pluggyClientSecret: string;
  pluggyBaseUrl: string;
  /** Sent by Pluggy with every webhook, as configured when the webhook was created. */
  webhookSecret: string;
  /** Optional: Expo's push security token, if "enhanced security" is on for the project. */
  expoAccessToken: string;
  /** "1" lets the connection widget list Pluggy's sandbox banks (development, review). */
  pluggyIncludeSandbox: boolean;
  /** Where a bank's Open Finance consent page returns to, when the app sets one. */
  pluggyOauthRedirectUri: string;
}

export function readEnv(): Env {
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  const get = (name: string) => env?.get(name) ?? "";
  return {
    url: get("SUPABASE_URL"),
    anon: get("SUPABASE_ANON_KEY"),
    service: get("SUPABASE_SERVICE_ROLE_KEY"),
    pluggyClientId: get("PLUGGY_CLIENT_ID"),
    pluggyClientSecret: get("PLUGGY_CLIENT_SECRET"),
    pluggyBaseUrl: get("PLUGGY_API_URL"),
    webhookSecret: get("PLUGGY_WEBHOOK_SECRET"),
    expoAccessToken: get("EXPO_ACCESS_TOKEN"),
    pluggyIncludeSandbox: get("PLUGGY_INCLUDE_SANDBOX") === "1",
    pluggyOauthRedirectUri: get("PLUGGY_OAUTH_REDIRECT_URI"),
  };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export const fail = (code: string, error: string, status: number) => json({ code, error }, status);

export const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/**
 * Who is calling, from their own token. The id never comes from the request
 * body: that would let anyone act as anyone.
 */
export async function callerId(req: Request, env: Env, make: MakeClient): Promise<string | null> {
  const asUser = make(env.url, env.anon, {
    auth: NO_SESSION,
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data, error } = await asUser.auth.getUser();
  return error || !data?.user?.id ? null : (data.user.id as string);
}

/** A client acting as the caller, for anything Row Level Security should decide. */
export function userClient(req: Request, env: Env, make: MakeClient) {
  return make(env.url, env.anon, {
    auth: NO_SESSION,
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

export function adminClient(env: Env, make: MakeClient) {
  return make(env.url, env.service, { auth: NO_SESSION });
}

/**
 * Constant-time compare. A plain `===` returns as soon as two bytes differ,
 * and that timing difference is enough to recover a secret one character at a
 * time.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Work that may finish after the response, where the runtime allows it. */
export function inBackground(work: Promise<unknown>): Promise<unknown> {
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  const guarded = work.catch((e) => console.error("background:", (e as Error)?.message ?? String(e)));
  if (runtime?.waitUntil) {
    runtime.waitUntil(guarded);
    return Promise.resolve();
  }
  return guarded;
}
