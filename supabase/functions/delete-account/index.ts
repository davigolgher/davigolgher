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
// Every failure names the step that failed and why. Nobody debugging this can
// see inside the project from the phone showing the error, so "it didn't work"
// costs a round trip that a sentence would have saved.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Supabase injects these. A project with the legacy JWT keys disabled can
  // leave one empty, and `createClient` with an empty key throws a message
  // about its arguments that says nothing about the real cause.
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const missing = [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_ANON_KEY", ANON],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    return json(
      {
        step: "env",
        error: `The function is missing ${missing.join(", ")}. Supabase normally injects these; if the project has legacy API keys disabled, set them with \`supabase secrets set\`.`,
      },
      500,
    );
  }

  let step = "authenticate";
  try {
    // Identify the caller from their own token. The id comes from the verified
    // session, never from the request body — otherwise anyone could pass
    // someone else's id and delete their account.
    const asUser = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data, error: authError } = await asUser.auth.getUser();
    const user = data?.user;
    if (authError || !user) {
      return json({ step, error: authError?.message ?? "No valid session on the request." }, 401);
    }

    const userId = user.id;
    const admin = createClient(SUPABASE_URL, SERVICE);

    // Rows first. Most cascade from auth.users anyway, so a table that refuses
    // is worth reporting but not worth stopping for — the account still has to
    // go, and the cascade will take the rows with it.
    step = "rows";
    const failures: string[] = [];
    for (const table of TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) failures.push(`${table}: ${error.message}`);
    }

    // Uploaded files live outside the tables. There are none today — the app
    // has no attachment feature — but an orphaned bucket after a delete would
    // contradict the Privacy Policy, so it's cleared regardless.
    step = "storage";
    try {
      const { data: files } = await admin.storage.from("receipts").list(userId);
      if (files?.length) {
        await admin.storage.from("receipts").remove(files.map((f) => `${userId}/${f.name}`));
      }
    } catch {
      /* no bucket, or nothing in it */
    }

    // The account itself. This is the part the client cannot do, and the part
    // whose absence made deletion look like it worked while the login lived on.
    step = "deleteUser";
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json(
        {
          step,
          error: `${deleteError.message}. This is the step that needs the service role key — check that SUPABASE_SERVICE_ROLE_KEY is the service role key and not the anon key.`,
          rowFailures: failures,
        },
        500,
      );
    }

    return json({ deleted: true, rowFailures: failures });
  } catch (e) {
    return json({ step, error: (e as Error)?.message ?? String(e) }, 500);
  }
});
