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
- [x] App icon, splash and favicon generated from the Flow mark
- [x] Public legal/support pages deployed
- [x] Web product UI deleted — one app, one codebase

## Next 🔜

1. **Apple IAP via RevenueCat** — paywall, Guideline 3.1.2 disclosure, restore purchases, entitlement synced to Supabase. Needs the Apple Developer Program (~US$99/yr).
2. **Receipt photos** — `expo-image-picker` + upload to the private `receipts` bucket. The Privacy Policy already says receipts can be attached, and `src/lib/upload.ts` already validates them; the capture and upload are what's missing.

## Before submitting to the App Store

- Set `APP.company` in `src/config/app.ts` (`supportEmail` is set).
- Have the legal templates reviewed by a lawyer — they are drafts, not advice.
- `PrivacyInfo.xcprivacy`, age rating, EU trader status — see `APP_STORE.md`.
