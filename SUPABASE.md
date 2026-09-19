# Backend setup (Supabase + Gmail)

Supabase provides auth and per-user data (Postgres + Row Level Security) for the
native app. The app reads its config from `mobile/.env`
(`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`); with those unset
it shows a "backend not configured" screen instead of signing in.

**Subscriptions are not here.** Purchases go through Apple In-App Purchase via
RevenueCat — see `APP_STORE.md`. RevenueCat's webhook writes entitlements into
the `billing` table, which the app reads.

Secret keys live only in Edge Function secrets — never in the repo or the app
(only the anon key and OAuth client id are public).

Already wired in code:

- Client: `src/lib/backend/{client,client.native,auth,auth.native,data,gmail}.ts`
- Migrations: `supabase/migrations/*.sql`
- Edge Functions: `supabase/functions/{gmail-oauth,gmail-sync}`

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

## 2. App env

Copy `mobile/.env.example` → `mobile/.env` and fill the public values:

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>     # Project Settings → API
```

Restart with `npx expo start -c` — Expo inlines `EXPO_PUBLIC_*` at bundle time,
so a plain restart won't pick up a change.

## 3. Auth

In **Authentication → Providers**, **Email** is enabled by default.

The app signs in with a six-digit code rather than a link, so the **Magic Link**
email template (Authentication → Emails) must include `{{ .Token }}`:

```html
<h2>Sign in to Flow</h2>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;">{{ .Token }}</p>
<p>Type this code in the Flow app.</p>
```

Adding Google or Apple sign-in means enabling the provider here and registering
`https://<ref>.supabase.co/auth/v1/callback` with it. Note that offering a
third-party login makes **Sign in with Apple** mandatory under Guideline 4.8.

## 4. Edge Functions

Deploy:

```bash
supabase functions deploy gmail-oauth --no-verify-jwt    # Google calls back here
supabase functions deploy gmail-sync
```

Set the secrets (never commit these):

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID=...apps.googleusercontent.com \
  GOOGLE_CLIENT_SECRET=... \
  GMAIL_STATE_SECRET="$(openssl rand -base64 32)" \
  APP_URL=https://davigolgher-lmhg.vercel.app
```

`GMAIL_STATE_SECRET` signs the Gmail OAuth `state` parameter. The callback runs
unauthenticated, so without it a forged `state` could bind an inbox to the wrong
account — `gmail-oauth` refuses to run when it is missing.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
into functions automatically.

## 5. Subscriptions

Not handled here. Flow is an App Store app, and Guideline 3.1.1 requires digital
subscriptions consumed in the app to go through Apple In-App Purchase, so there
is no Stripe checkout and no external payment link.

The shape stays the same from the database's point of view: RevenueCat's webhook
writes the entitlement into the `billing` table, and the app reads
`billing.status` (`trialing` / `active`) to unlock. See `APP_STORE.md`.

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
