# Backend setup (Supabase)

Supabase provides auth and per-user data (Postgres + Row Level Security) for the
native app. The app reads its config from `mobile/.env`
(`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`); with those unset
it shows a "backend not configured" screen instead of signing in.

**Subscriptions are not here.** Purchases go through Apple In-App Purchase via
RevenueCat — see `APP_STORE.md`. RevenueCat's webhook writes entitlements into
the `billing` table, which the app reads.

Secret keys live only in Edge Function secrets — never in the repo or the app
(only the anon key is public; Row Level Security is what protects the data).

Already wired in code:

- Client: `src/lib/backend/{client,client.native,auth,auth.native,data,billing}.ts`
- Migrations: `supabase/migrations/*.sql`
- Edge Functions: `supabase/functions/{delete-account,revenuecat-webhook}`

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

The app uses **email + password**, with no verification step — creating an
account signs you straight in.

That needs one setting changed: **Authentication → Sign In / Providers → Email →
turn OFF "Confirm email"**. Leave it on and `signUp` returns a user with no
session, so the account is created but can't be used until the emailed link is
opened. The app detects that case and says so rather than failing silently.

> Why not a magic link or an emailed code? Supabase's built-in sender is capped
> at a handful of messages an hour and is documented as unsuitable for
> production, and editing the email templates at all requires custom SMTP. Both
> matter later — password *reset* needs email, as do renewal reminders — so
> expect to set up SMTP before launch. Nothing about sign-in depends on it.

Adding Google or Apple sign-in means enabling the provider here and registering
`https://<ref>.supabase.co/auth/v1/callback` with it. Note that offering a
third-party login makes **Sign in with Apple** mandatory under Guideline 4.8.

## 4. Edge Functions

Both are single files with no local imports, so either deploy route works.

With the CLI:

```bash
supabase functions deploy delete-account                       # caller proves who they are
supabase functions deploy revenuecat-webhook --no-verify-jwt   # RevenueCat has no session
```

Or from the dashboard — **Edge Functions → Deploy a new function → Via Editor**
— by pasting the file in. No CLI, no Docker. Name the function exactly
`delete-account`: that string is what `functions.invoke()` calls. The editor
fills the name with a random slug (`dynamic-task`, `super-endpoint`) and it's
easy to deploy without changing it — the code then runs fine and the app gets a
404 `NOT_FOUND`, because nothing is at the name it asks for.

`delete-account` keeps JWT verification **on**: it takes the user id from the
verified session, never from the request body, so nobody can delete someone
else's account. `revenuecat-webhook` must have it **off** — RevenueCat has no
Supabase session, and its shared secret is what authenticates it instead.

Set the secrets (never commit these):

```bash
supabase secrets set \
  REVENUECAT_WEBHOOK_SECRET="$(openssl rand -base64 32)" \
  APP_URL=https://davigolgher-lmhg.vercel.app
```

`REVENUECAT_WEBHOOK_SECRET` must match the Authorization value set in
RevenueCat → Integrations → Webhooks. The endpoint grants paid access, so it
refuses to run without one and compares in constant time.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
into functions automatically.

## 5. Subscriptions

Not handled here. Flow is an App Store app, and Guideline 3.1.1 requires digital
subscriptions consumed in the app to go through Apple In-App Purchase, so there
is no Stripe checkout and no external payment link.

The shape stays the same from the database's point of view: RevenueCat's webhook
writes the entitlement into the `billing` table, and the app reads
`billing.status` (`trialing` / `active`) to unlock. See `APP_STORE.md`.

## Security notes

- RLS scopes every table to `auth.uid()`. `billing` is readable by its owner but
  writable only by the service role — the store decides who has paid, not the app.
- Client upload checks are not a security boundary — re-validate on the server.
- See `SECURITY.md` for the webhook authentication rationale.
- Account deletion goes through `delete-account`, which removes the rows, the
  storage files **and** the auth user. Deleting only the data would leave the
  login alive, which Apple treats as not having deleted the account.
