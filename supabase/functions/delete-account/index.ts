// Delete the signed-in user's account, for real.
//
// The app can delete its own rows under RLS, but removing the auth user needs
// the service role key — which must never ship in a client. Without this the
// account survived: the data went, the login didn't, and signing up again with
// the same address just signed the old account back in.
//
// Apple requires account deletion to actually delete the account (Guideline
// 5.1.1(v)), so "we deleted your data" is not enough.
//
// Deploy normally (JWT verification ON — the caller must prove who they are):
//   supabase functions deploy delete-account
//
// Everything is in this one file on purpose: it can then be deployed by pasting
// it into the dashboard's function editor, with no CLI and no Docker.
//
// Who may delete: the caller's identity comes from their own token, and the
// request must also carry the account's password, checked before anything is
// erased. A session alone — an unlocked phone, a token copied out of a backup —
// is not enough to destroy years of records (MASVS-AUTH-3; OWASP ASVS asks for
// re-authentication before highly sensitive operations).
//
// What the caller is told: a plain sentence, a short code and the step, never
// raw database or configuration errors (OWASP ASVS V16: generic messages to
// the consumer, details in the server's log). The details go to the
// function's logs — Dashboard → Edge Functions → delete-account → Logs.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Rows to clear before the user. Order doesn't matter — none reference another. */
const TABLES = ["transactions", "subscriptions", "categories", "budgets", "preferences", "billing", "activity_days"];

export interface Env {
  url: string;
  anon: string;
  service: string;
}

// deno-lint-ignore no-explicit-any
type MakeClient = (url: string, key: string, options?: any) => any;

function readEnv(): Env {
  // Supabase injects these into every function.
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  return {
    url: env?.get("SUPABASE_URL") ?? "",
    anon: env?.get("SUPABASE_ANON_KEY") ?? "",
    service: env?.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };
}

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

export async function handle(req: Request, env: Env = readEnv(), make: MakeClient = createClient): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Deleting is never a side effect of a GET, a HEAD or a link.
  if (req.method !== "POST") return json({ code: "method_not_allowed", error: "Use POST." }, 405);

  if (!env.url || !env.anon || !env.service) {
    console.error("delete-account: missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
    return json({ code: "unavailable", step: "env", error: "Account deletion is unavailable right now. Try again later." }, 500);
  }

  let step = "authenticate";
  try {
    // Identify the caller from their own token. The id comes from the verified
    // session, never from the request body — otherwise anyone could pass
    // someone else's id and delete their account.
    const asUser = make(env.url, env.anon, {
      auth: NO_SESSION,
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data, error: authError } = await asUser.auth.getUser();
    const user = data?.user;
    if (authError || !user) {
      return json({ code: "not_signed_in", step, error: "Sign in again, then try deleting the account." }, 401);
    }

    step = "password";
    let password = "";
    try {
      const body = await req.json();
      if (typeof body?.password === "string") password = body.password;
    } catch {
      /* no body, or not JSON — same as no password */
    }
    if (!password) {
      return json({ code: "password_required", step, error: "Enter your password to delete the account." }, 400);
    }
    if (!user.email) {
      console.error("delete-account: user has no email to check a password against", user.id);
      return json({ code: "unavailable", step, error: "This account can't be deleted from the app. Contact support." }, 400);
    }
    // A throwaway client, so the check leaves nothing behind but a session
    // that goes with the account a moment later.
    const probe = make(env.url, env.anon, { auth: NO_SESSION });
    const { data: proof, error: pwError } = await probe.auth.signInWithPassword({ email: user.email, password });
    if (pwError || proof?.user?.id !== user.id) {
      console.warn("delete-account: wrong password", user.id);
      return json({ code: "wrong_password", step, error: "That password isn't right. Nothing was deleted." }, 401);
    }

    const userId = user.id;
    const admin = make(env.url, env.service, { auth: NO_SESSION });

    // Rows first. Most cascade from auth.users anyway, so a table that refuses
    // is worth logging but not worth stopping for — the account still has to
    // go, and the cascade will take the rows with it.
    step = "rows";
    for (const table of TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) console.error(`delete-account: ${table}:`, error.message);
    }

    // Uploaded files live outside the tables. There are none today — the app
    // has no attachment feature — but an orphaned file after a delete would
    // contradict the Privacy Policy, so the account's folder is cleared anyway.
    step = "storage";
    try {
      for (;;) {
        const { data: files } = await admin.storage.from("receipts").list(userId, { limit: 1000 });
        if (!files?.length) break;
        await admin.storage.from("receipts").remove(files.map((f: { name: string }) => `${userId}/${f.name}`));
        if (files.length < 1000) break;
      }
    } catch (e) {
      console.error("delete-account: storage:", (e as Error)?.message);
    }

    // The account itself. This is the part the client cannot do, and the part
    // whose absence made deletion look like it worked while the login lived on.
    step = "deleteUser";
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("delete-account: deleteUser:", deleteError.message);
      await probe.auth.signOut({ scope: "local" }).catch(() => {});
      return json({ code: "delete_failed", step, error: "The account could not be deleted. Try again later." }, 500);
    }

    return json({ deleted: true });
  } catch (e) {
    console.error(`delete-account: ${step}:`, (e as Error)?.message ?? String(e));
    return json({ code: "delete_failed", step, error: "The account could not be deleted. Try again later." }, 500);
  }
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve((req: Request) => handle(req));
