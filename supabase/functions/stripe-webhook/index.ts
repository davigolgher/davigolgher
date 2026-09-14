// Verifies Stripe webhook signatures and mirrors subscription state into `billing`.
// Deploy WITHOUT JWT verification: `supabase functions deploy stripe-webhook --no-verify-jwt`
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY,
//          STRIPE_PRICE_YEARLY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import Stripe from "npm:stripe@16";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text(); // raw body is required for verification
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = await resolveSubscription(event);
        if (sub) await upsertBilling(sub);
        break;
      }
    }
  } catch (e) {
    console.error("webhook handler error", e);
    return new Response("handler error", { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { status: 200 });
});

async function resolveSubscription(event: Stripe.Event): Promise<Stripe.Subscription | null> {
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (typeof s.subscription === "string") return await stripe.subscriptions.retrieve(s.subscription);
    return null;
  }
  return event.data.object as Stripe.Subscription;
}

async function upsertBilling(sub: Stripe.Subscription) {
  const userId = (sub.metadata?.user_id as string) || (await userIdFromCustomer(sub.customer));
  if (!userId) return;
  const priceId = sub.items.data[0]?.price?.id;
  await admin.from("billing").upsert({
    user_id: userId,
    plan: planFromPrice(priceId),
    status: sub.status, // trialing | active | past_due | canceled | ...
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
}

function planFromPrice(priceId?: string): string | null {
  if (!priceId) return null;
  if (priceId === Deno.env.get("STRIPE_PRICE_MONTHLY")) return "monthly";
  if (priceId === Deno.env.get("STRIPE_PRICE_YEARLY")) return "yearly";
  return null;
}

async function userIdFromCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer): Promise<string | null> {
  const id = typeof customer === "string" ? customer : customer.id;
  const { data } = await admin.from("billing").select("user_id").eq("stripe_customer_id", id).maybeSingle();
  return (data?.user_id as string) ?? null;
}
