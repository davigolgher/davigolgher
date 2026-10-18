# Flow — status

**Flow is a native iOS app.** There is no web version of the product.

The only thing deployed to the web is the legal & support pages, because App
Store Connect requires a reachable **Privacy Policy URL** and **Support URL** —
App Review opens both from the store listing.

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
| iOS bundle id | `com.davigolgher.flow` |

Secrets (the service role key, RevenueCat's webhook secret) live only in
Supabase Edge Function secrets — never in this repo. The Supabase anon key is
public by design; RLS is the protection.

## Done ✅

- [x] Native app runs on device via Expo Go
- [x] Shared logic imported by the app rather than duplicated
- [x] Supabase auth on native — email + password, no verification step
- [x] Data syncs under RLS (`auth.uid() = user_id`) on all 8 tables
- [x] Screens: Home, Expenses, Subs, Reports (donut + bars), Settings, add-expense
- [x] Settings: budget, currency, categories, legal docs, sign out, delete account
- [x] Renewal reminders — local notifications 1–7 days before a charge (compliance item 9)
- [x] Streak stored per account on the server (`activity_days`), not per phone
- [x] App icon, splash and favicon generated from the Flow mark
- [x] Public legal/support pages deployed
- [x] Web product UI deleted — one app, one codebase

## Next 🔜

1. **Apple IAP via RevenueCat** — paywall, Guideline 3.1.2 disclosure, restore purchases, entitlement synced to Supabase. Needs the Apple Developer Program (~US$99/yr). This is the only thing left.

## Decided against

- **Email verification and password recovery.** Sign-up takes any well-formed
  address and there is no "forgot password" — both would need SMTP, and the
  verification step was dropped on purpose to keep sign-up to one screen.
  `src/lib/email.ts` catches typos in common domains so the address is at least
  likely to be the one intended, and sign-up says outright that it's the only
  way back in. The exposure is lockout, not disclosure: RLS scopes every table
  to `auth.uid()`, so an account made with a fake address reaches nothing but
  its own empty rows. Revisit if support starts hearing from locked-out users.

- **Receipt photos.** The Privacy Policy, the nutrition label and the iOS camera and
  photo-library permissions were all taken back out to match — an app that declares a
  permission it never uses gets asked about it at review.
- **Gmail import.** `gmail.readonly` is a Google restricted scope: a yearly third-party
  CASA security assessment for a convenience feature. See migration `0005`.

## Before submitting to the App Store

- Set `APP.company` in `src/config/app.ts` (`supportEmail` is set).
- Have the legal templates reviewed by a lawyer — they are drafts, not advice.
- `PrivacyInfo.xcprivacy`, age rating, EU trader status — see `APP_STORE.md`.
