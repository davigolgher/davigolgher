// Opens the Stripe Billing Portal so users can manage/cancel in one tap
// (cancellation as easy as sign-up). Deploy: `supabase functions deploy create-portal`
// Secrets: STRIPE_SECRET_KEY, APP_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import Stripe from "npm:stripe@16";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const APP_URL = Deno.env.get("APP_URL") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
    } = await asUser.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: billing } = await admin.from("billing").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    const customer = billing?.stripe_customer_id as string | undefined;
    if (!customer) return json({ error: "No billing account yet" }, 400);

    const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${APP_URL}/settings` });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
