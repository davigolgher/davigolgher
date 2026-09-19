# Flow — status

**Flow is a native iOS app.** There is no web version of the product.

The only thing deployed to the web is the legal & support pages, because App
Store Connect requires a reachable **Privacy Policy URL** and **Support URL**
(App Review opens them from the store listing, and Google requires the privacy
one for OAuth).

## Repo layout

| Path | What it is |
| --- | --- |
| `mobile/` | The app — Expo SDK 57, React Native, Expo Router, NativeWind |
| `src/` | Shared logic (money, calc, reports, streak, store, auth, legal text) **and** the public legal/support pages |
| `supabase/` | Schema, RLS migrations, Edge Functions |

The app imports the shared modules from `src/` as `@/…`; see `mobile/README.md`
for how that resolution works and which files have `.native` counterparts.

## Values

| What | Value |
| --- | --- |
| Public pages | `https://davigolgher-lmhg.vercel.app` (`/privacy`, `/terms`, `/support`) |
| Supabase project | `https://jlerplyropsbcyqvqlgj.supabase.co` |
| OAuth callback | `https://jlerplyropsbcyqvqlgj.supabase.co/auth/v1/callback` |
| iOS bundle id | `com.davigolgher.flow` |

Secrets (service role, Google client secret, RevenueCat secret) live only in
Supabase Edge Function secrets — never in this repo. The Supabase anon key is
public by design; RLS is the protection.

## Done ✅

- [x] Native app runs on device via Expo Go
- [x] Shared logic imported by the app rather than duplicated
- [x] Supabase auth on native — six-digit emailed code, no leaving the app
- [x] Data syncs under RLS (`auth.uid() = user_id`) on all 8 tables
- [x] Screens: Home, Expenses, Subs, Reports (donut + bars), Settings, add-expense
- [x] Settings: budget, currency, categories, legal docs, sign out, delete account
- [x] Public legal/support pages deployed
- [x] Web product UI deleted — one app, one codebase

## Next 🔜

1. **Apple IAP via RevenueCat** — paywall, Guideline 3.1.2 disclosure, restore purchases, entitlement synced to Supabase. Needs the Apple Developer Program (~US$99/yr).
2. **Push notifications** — `expo-notifications`, renewal reminders before a charge (closes compliance item 9).
3. **Receipt photos** — `expo-image-picker` + upload to the private `receipts` bucket.
4. **Gmail import** — owner is doing this; the Edge Functions and the client helper (`src/lib/backend/gmail.ts`) are in place. Note `gmail.readonly` is a Google *restricted* scope: production use needs OAuth verification plus a CASA security assessment, so consider receipt-forwarding instead.

## Before submitting to the App Store

- Set `APP.supportEmail` and `APP.company` in `src/config/app.ts`.
- Real 1024×1024 icon and splash in `mobile/assets/images/` (currently Expo placeholders).
- Have the legal templates reviewed by a lawyer — they are drafts, not advice.
- `PrivacyInfo.xcprivacy`, age rating, EU trader status — see `APP_STORE.md`.
