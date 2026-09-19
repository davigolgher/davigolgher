// Reads recent receipt-like emails and inserts them as expenses (source=gmail).
// Deploy: `supabase functions deploy gmail-sync`
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL,
//          SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
//
// The parser here is a deliberately simple heuristic (find a currency amount and
// use the sender as the merchant). Real receipt extraction needs per-merchant
// templates or an LLM pass — treat this as the wiring, not a finished parser.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

// deno-lint-ignore no-explicit-any
type Any = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const asUser = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
    } = await asUser.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: tok } = await admin.from("gmail_tokens").select("refresh_token").eq("user_id", user.id).maybeSingle();
    if (!tok?.refresh_token) return json({ error: "Gmail not connected" }, 400);

    const accessToken = await refreshAccess(tok.refresh_token);
    const { data: prefs } = await admin.from("preferences").select("currency").eq("user_id", user.id).maybeSingle();
    const currency = prefs?.currency ?? "USD";

    const q = encodeURIComponent('newer_than:90d (receipt OR order OR invoice OR "payment to")');
    const list = await gmail(`/messages?q=${q}&maxResults=20`, accessToken);
    const ids: string[] = (list.messages ?? []).map((m: Any) => m.id);

    const rows: Any[] = [];
    for (const id of ids) {
      const msg = await gmail(`/messages/${id}?format=full`, accessToken);
      const parsed = parseReceipt(msg);
      if (parsed) {
        rows.push({
          user_id: user.id,
          external_id: id,
          amount: parsed.amount,
          direction: "expense",
          description: parsed.merchant,
          category: "Imported",
          date: parsed.date,
          currency,
          source: "gmail",
        });
      }
    }

    let imported = 0;
    if (rows.length) {
      const { error, count } = await admin
        .from("transactions")
        .upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true, count: "exact" });
      if (error) throw error;
      imported = count ?? 0;
    }
    return json({ imported });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

async function refreshAccess(refresh: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Could not refresh Google token");
  return j.access_token as string;
}

async function gmail(path: string, token: string): Promise<Any> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Gmail API ${r.status}`);
  return r.json();
}

function parseReceipt(msg: Any): { amount: number; merchant: string; date: string } | null {
  const headers = msg.payload?.headers ?? [];
  const from = String(headers.find((h: Any) => h.name === "From")?.value ?? "").replace(/<.*>/, "").replace(/"/g, "").trim();
  const dateHdr = headers.find((h: Any) => h.name === "Date")?.value;
  const date = dateHdr ? new Date(dateHdr).toISOString() : new Date().toISOString();
  const text = decodeBody(msg.payload);
  const m = text.match(/(?:\$|USD\s?)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/);
  if (!m) return null;
  const amount = Math.round(parseFloat(m[1].replace(/,/g, "")) * 100);
  if (!amount) return null;
  return { amount, merchant: from || "Gmail import", date };
}

function decodeBody(payload: Any): string {
  if (!payload) return "";
  const parts = payload.parts ?? [payload];
  for (const p of parts) if (p.mimeType === "text/plain" && p.body?.data) return b64url(p.body.data);
  for (const p of parts) if (p.body?.data) return b64url(p.body.data);
  return "";
}

function b64url(data: string): string {
  try {
    return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return "";
  }
}
