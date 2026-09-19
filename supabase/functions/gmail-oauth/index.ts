// Google OAuth for Gmail (read-only). Two entry points in one function:
//   POST { action: "start" }  (authenticated) → returns the Google consent URL
//   GET  ?code=…&state=<signed>(Google callback)→ stores the refresh token
// Deploy: `supabase functions deploy gmail-oauth --no-verify-jwt`
// Register REDIRECT_URI ( `${SUPABASE_URL}/functions/v1/gmail-oauth` ) in the
// Google Cloud OAuth client. Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GMAIL_STATE_SECRET, APP_URL, SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const APP_URL = Deno.env.get("APP_URL") ?? "";
// Signs the OAuth `state`. Generate with: openssl rand -base64 32
const STATE_SECRET = Deno.env.get("GMAIL_STATE_SECRET") ?? "";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-oauth`;
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const STATE_TTL_MS = 10 * 60 * 1000; // a consent screen the user left open for 10min is stale

/*
 * OAuth CSRF protection.
 *
 * The callback runs unauthenticated (Google calls it), so `state` is the only
 * thing tying the returned code back to a user. An unsigned `state` would let an
 * attacker swap in someone else's user id and bind an inbox to the wrong
 * account — either handing the victim's Gmail token to the attacker or the
 * attacker's inbox to the victim. So `state` is HMAC-signed here and verified on
 * the way back, with a timestamp so a captured URL can't be replayed later.
 */

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function unb64url(s: string): Uint8Array {
  const norm = s.replaceAll("-", "+").replaceAll("_", "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(STATE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** `state` = base64url(payload) "." base64url(HMAC-SHA256(payload)). */
async function signState(userId: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ u: userId, t: Date.now() })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

/** Returns the user id when the signature and timestamp both check out, else null. */
async function verifyState(state: string): Promise<string | null> {
  const dot = state.indexOf(".");
  if (dot <= 0) return null;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  try {
    // crypto.subtle.verify compares in constant time.
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), unb64url(sig), enc.encode(payload));
    if (!ok) return null;
    const { u, t } = JSON.parse(new TextDecoder().decode(unb64url(payload)));
    if (typeof u !== "string" || !u || typeof t !== "number") return null;
    if (Date.now() - t > STATE_TTL_MS) return null;
    return u;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Fail closed: without a signing secret we cannot trust any callback.
  if (!STATE_SECRET) return json({ error: "GMAIL_STATE_SECRET is not set" }, 500);
  const url = new URL(req.url);

  // 1) Callback from Google.
  if (req.method === "GET" && (url.searchParams.get("code") || url.searchParams.get("error"))) {
    if (url.searchParams.get("error")) return Response.redirect(`${APP_URL}/settings?gmail=denied`, 302);
    const code = url.searchParams.get("code")!;
    const userId = await verifyState(url.searchParams.get("state") ?? "");
    if (!userId) return Response.redirect(`${APP_URL}/settings?gmail=error`, 302);
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      const tok = await res.json();
      if (!tok.refresh_token) return Response.redirect(`${APP_URL}/settings?gmail=error`, 302);
      const admin = createClient(SUPABASE_URL, SERVICE);
      await admin.from("gmail_tokens").upsert({
        user_id: userId,
        refresh_token: tok.refresh_token,
        connected_at: new Date().toISOString(),
      });
      await admin.from("preferences").upsert({ user_id: userId, gmail_connected: true });
      return Response.redirect(`${APP_URL}/settings?gmail=connected`, 302);
    } catch {
      return Response.redirect(`${APP_URL}/settings?gmail=error`, 302);
    }
  }

  // 2) Start — authenticated; return the consent URL.
  try {
    const asUser = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
    } = await asUser.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    consent.searchParams.set("client_id", CLIENT_ID);
    consent.searchParams.set("redirect_uri", REDIRECT_URI);
    consent.searchParams.set("response_type", "code");
    consent.searchParams.set("scope", SCOPE);
    consent.searchParams.set("access_type", "offline");
    consent.searchParams.set("prompt", "consent");
    consent.searchParams.set("state", await signState(user.id));
    return json({ url: consent.toString() });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
