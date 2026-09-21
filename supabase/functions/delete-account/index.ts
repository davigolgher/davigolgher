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
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Identify the caller from their own token. The id comes from the verified
    // session, never from the request body — otherwise anyone could pass
    // someone else's id and delete their account.
    const asUser = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
    } = await asUser.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const userId = user.id;
    const admin = createClient(SUPABASE_URL, SERVICE);

    // Rows first. Most cascade from auth.users anyway, but deleting them
    // explicitly means a failure at the last step doesn't leave data behind.
    await Promise.all([
      admin.from("transactions").delete().eq("user_id", userId),
      admin.from("subscriptions").delete().eq("user_id", userId),
      admin.from("categories").delete().eq("user_id", userId),
      admin.from("budgets").delete().eq("user_id", userId),
      admin.from("preferences").delete().eq("user_id", userId),
      admin.from("billing").delete().eq("user_id", userId),
    ]);

    // Uploaded receipts live outside the tables.
    try {
      const { data: files } = await admin.storage.from("receipts").list(userId);
      if (files?.length) {
        await admin.storage.from("receipts").remove(files.map((f) => `${userId}/${f.name}`));
      }
    } catch {
      /* ignore — the rows are the primary record */
    }

    // The account itself. This is the part the client cannot do.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 500);

    return json({ deleted: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
