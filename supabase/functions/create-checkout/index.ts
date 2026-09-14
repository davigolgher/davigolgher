// Creates a Stripe Checkout Session for the signed-in user and returns its URL.
// Deploy: `supabase functions deploy create-checkout`
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY, APP_URL,
//          SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import Stripe from "npm:stripe@16";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const APP_URL = Deno.env.get("APP_URL") ?? "";
const PRICES: Record<string, string | undefined> = {
  monthly: Deno.env.get("STRIPE_PRICE_MONTHLY"),
  yearly: Deno.env.get("STRIPE_PRICE_YEARLY"),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Identify the caller from their Supabase JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await asUser.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { plan = "yearly" } = await req.json().catch(() => ({ plan: "yearly" }));
    const price = PRICES[plan] ?? PRICES.yearly;
    if (!price) return json({ error: "Price id not configured" }, 500);

    // Reuse (or create) the user's Stripe customer, stored in billing.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: billing } = await admin.from("billing").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    let customer = billing?.stripe_customer_id as string | undefined;
    if (!customer) {
      const created = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
      customer = created.id;
      await admin.from("billing").upsert({ user_id: user.id, stripe_customer_id: customer, status: "inactive" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { trial_period_days: 7, metadata: { user_id: user.id } },
      client_reference_id: user.id,
      allow_promotion_codes: true,
      success_url: `${APP_URL}/?checkout=success&plan=${plan}`,
      cancel_url: `${APP_URL}/?checkout=cancel`,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
