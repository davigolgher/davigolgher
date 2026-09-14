// Google OAuth for Gmail (read-only). Two entry points in one function:
//   POST { action: "start" }  (authenticated) → returns the Google consent URL
//   GET  ?code=…&state=userId (Google callback)→ stores the refresh token
// Deploy: `supabase functions deploy gmail-oauth --no-verify-jwt`
// Register REDIRECT_URI ( `${SUPABASE_URL}/functions/v1/gmail-oauth` ) in the
// Google Cloud OAuth client. Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// APP_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
//
// NOTE: `state` carries the user id. For production, sign it (HMAC) and verify
// on callback to prevent OAuth CSRF (attaching an attacker's inbox to a victim).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const APP_URL = Deno.env.get("APP_URL") ?? "";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-oauth`;
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  // 1) Callback from Google.
  if (req.method === "GET" && url.searchParams.get("code")) {
    const code = url.searchParams.get("code")!;
    const state = url.searchParams.get("state") ?? "";
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
      const admin = createClient(SUPABASE_URL, SERVICE);
      if (tok.refresh_token && state) {
        await admin.from("gmail_tokens").upsert({
          user_id: state,
          refresh_token: tok.refresh_token,
          connected_at: new Date().toISOString(),
        });
        await admin.from("preferences").upsert({ user_id: state, gmail_connected: true });
      }
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
    consent.searchParams.set("state", user.id);
    return json({ url: consent.toString() });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
