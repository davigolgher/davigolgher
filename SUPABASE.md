# Backend setup (Supabase + Stripe + Gmail)

Flow runs in two modes:

- **Local demo** (no env vars) — in-memory data, local funnel. This is what the
  published preview uses.
- **Connected** — set the two `VITE_SUPABASE_*` vars and the app switches to real
  auth, per-user data in Postgres (RLS), Stripe subscriptions, and Gmail import.

Nothing goes live until you complete the steps below with **your own** accounts.
Secret keys live only in Edge Function secrets — never in the repo or frontend
(only the anon key, Stripe publishable key, and OAuth client id are public).

Everything is already wired in code:

- Client: `src/lib/backend/{client,auth,data,billing,gmail}.ts`
- Migrations: `supabase/migrations/*.sql`
- Edge Functions: `supabase/functions/{create-checkout,stripe-webhook,gmail-oauth,gmail-sync}`

---

## 1. Create the project & database

1. Create a project at supabase.com and install the CLI (`npm i -g supabase`).
2. Link and push the schema:
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push          # applies supabase/migrations/*
   ```
   (Or paste each file in `supabase/migrations/` into the SQL editor, in order.)
   This creates the tables, **Row Level Security** policies, the private
   `receipts` storage bucket, and the new-user trigger.

## 2. Frontend env

Copy `.env.example` → `.env.local` and fill the public values:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>          # Project Settings → API
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...     # optional, safe to expose
```

Rebuild (`npm run build`). With these set, the sign-up screen uses Supabase Auth.

## 3. Auth providers

In **Authentication → Providers**:

- **Email** — enabled by default; the app uses magic links.
- **Google** / **Apple** — enable and paste their client id/secret. Add your app
  origin to **URL Configuration → Redirect URLs** (e.g. `https://your-app.com`).

## 4. Edge Functions

Deploy:

```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt   # Stripe signs these
supabase functions deploy gmail-oauth   --no-verify-jwt    # Google calls back here
supabase functions deploy gmail-sync
```

Set the secrets (never commit these):

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_MONTHLY=price_... \
  STRIPE_PRICE_YEARLY=price_... \
  GOOGLE_CLIENT_ID=...apps.googleusercontent.com \
  GOOGLE_CLIENT_SECRET=... \
  APP_URL=https://your-app.com
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
into functions automatically.

## 5. Stripe

1. Create a **Product** with two recurring **Prices** (monthly, yearly). Copy the
   `price_…` ids into `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`.
2. **Developers → Webhooks → Add endpoint**:
   `https://<ref>.supabase.co/functions/v1/stripe-webhook`, events:
   `checkout.session.completed`, `customer.subscription.created|updated|deleted`.
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Flow: the paywall calls `create-checkout` → Stripe Checkout (7-day trial) →
   returns to `APP_URL/?checkout=success`. The webhook verifies the signature and
   writes `billing`; the app reads `billing.status` (`trialing`/`active`) to unlock.

> App Store note: in-app digital subscriptions must use Apple IAP or the External
> Purchase Link entitlement — see `APP_STORE.md`. Stripe Checkout is for web.

## 6. Gmail

1. Google Cloud → **APIs & Services**: enable the **Gmail API**, configure the
   **OAuth consent screen** (scope `.../auth/gmail.readonly`), and create an
   **OAuth client (Web)**.
2. Authorized redirect URI:
   `https://<ref>.supabase.co/functions/v1/gmail-oauth`. Put the client id/secret
   in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
3. Flow: Settings → Connect Gmail → `gmail-oauth` (consent) → stores the refresh
   token in `gmail_tokens`. **Import purchases** calls `gmail-sync`, which reads
   recent receipts and inserts them (deduped by Gmail message id).
4. Reading real inboxes requires Google **app verification** (a restricted scope);
   until then it works for test users you add on the consent screen.

## Security notes

- RLS scopes every table to `auth.uid()`. `gmail_tokens` has **no** client policy —
  only Edge Functions (service role) touch it.
- Harden `gmail-oauth`: the OAuth `state` currently carries the user id; sign it
  (HMAC) and verify on callback to prevent OAuth CSRF.
- Client upload checks are not a boundary — re-validate on the server. See
  `SECURITY.md` (includes the Stripe webhook verification rationale).
- Full account deletion removes the user's rows from the client; deleting the
  **auth user** itself needs an admin (service-role) function — add one if required.
