# Flow — native app (Expo / React Native)

Real native app, not a WebView wrapper. Expo SDK 57, React Native 0.86, Expo
Router, NativeWind.

## Run it on your iPhone

1. Install **Expo Go** from the App Store (free).
2. On your computer, from this folder:

```bash
npm install     # first time only
npx expo start
```

3. A QR code appears in the terminal. Scan it with the iPhone **Camera** app and
   open in Expo Go. The app loads over your Wi-Fi — phone and computer must be on
   the same network.

Edits reload on the phone in a second or two. Press `r` in the terminal to force
a reload, `?` for the other shortcuts.

## Shared code

Flow is app-only; `../src` is not a second app. It holds the shared core (the
maths, the store, auth, legal text) plus the public `/privacy` and `/support`
pages that App Store Connect requires.

These files are pure TypeScript — no DOM, no React, no npm imports — so they run
unchanged on native:

`lib/money` · `lib/calc` · `lib/recurrence` · `lib/reports` · `lib/streak`
`lib/format` · `lib/sanitize` · `lib/cn` · `data/types` · `data/currencies`
`config/app`

Two import aliases:

| Alias | Points to | Use for |
| --- | --- | --- |
| `@/…` | `../src/…` | shared logic (also how those files import each other) |
| `~/…` | `./src/…`  | this app's own code |

They are configured in **both** `babel.config.js` (module-resolver, for Metro)
and `tsconfig.json` (paths, for TypeScript) — change one, change the other.

`metro.config.js` adds `../src` to `watchFolders`, otherwise Metro can't read
those files or notice edits in them.

### Platform adapters

Three shared modules touch browser APIs and so have native counterparts in
`src/lib/` rather than being imported from `../src`:

| Web (`../src/lib`) | Native (`src/lib`) | Why |
| --- | --- | --- |
| `activity.ts` (localStorage) | `activity.ts` (AsyncStorage) | hydrated once on launch, kept in memory so reads stay synchronous |
| `hooks.ts` (`matchMedia`, `document`) | _pending_ | no DOM on native |
| `upload.ts` (`File`, `FileReader`) | _pending_ | uses expo-image-picker + expo-file-system instead |

## Subscriptions (Apple IAP via RevenueCat)

Flow is free to download and needs a subscription to use: after sign-in and the
introduction, the paywall sells a monthly and a yearly plan through Apple
In-App Purchase, wrapped by RevenueCat (`react-native-purchases`).

The app side is done: `src/lib/purchases.ts` reads the plans and prices from
the store, buys, restores, and ties every purchase to the Supabase account
(`logIn(userId)`), so the webhook knows whose `billing` row to write and the
subscription follows the account to another device. It runs in any build from
EAS that has `EXPO_PUBLIC_REVENUECAT_IOS_KEY`. Expo Go keeps working, without
prices and with the development-only way past the paywall.

What has to exist outside the code, in this order:

1. **Apple Developer Program**, then in App Store Connect → Business, the
   **Paid Apps Agreement** with banking and tax details. IAP is unavailable
   until it's active — even in a free app.
2. **App Store Connect → your app → Subscriptions**: one group (e.g. "Flow
   Pro") with two auto-renewable subscriptions, monthly and yearly. Each needs a
   price, a display name and description, and a review screenshot of the
   paywall. The **14-day free trial** is an introductory offer on each one:
   Subscription Prices → Introductory Offers → type *Free*, duration *2
   weeks*, for new subscribers. The paywall reads it from the store and shows
   "Start 14-day free trial" by itself — nothing to change in the code.
   **Prices**: US$ **8.99** a month and US$ **59.99** a year. Twelve months
   cost US$ 107.88, so the yearly plan is 44.39% less — the paywall shows
   "Best value · Save 44%", "$5.00 a month" and, on Monthly, "Yearly works out
   to 5 months free". Set the United States price on each product and App
   Store Connect fills in every other country; the saving is recomputed from
   each country's real prices, so it stays true everywhere (it can differ by a
   point or two after rounding). To use round local prices in Brazil instead,
   edit that country's price by hand — keep the yearly one at about 56% of
   twelve monthly payments.
3. **RevenueCat**: a project with the App Store app (bundle id
   `com.davigolgher.flow`) and its In-App Purchase key, both products imported,
   an entitlement called **`pro`** containing both, and the **current offering**
   with a *Monthly* and an *Annual* package. The public iOS key ("appl_…") goes
   in EAS as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (see "Building for TestFlight").
4. **Webhook**: in Supabase → Edge Functions → Secrets, set
   `REVENUECAT_WEBHOOK_SECRET` to a long random value; deploy
   `revenuecat-webhook` with JWT verification off; in RevenueCat →
   Integrations → Webhooks, point it at
   `https://<ref>.supabase.co/functions/v1/revenuecat-webhook` with the same
   value in the Authorization header.
5. **Test** on a TestFlight build with a **sandbox tester** (App Store Connect →
   Users and Access → Sandbox): buy, cancel, restore, and let it expire.

The first subscriptions go to App Review **together with the app version** —
attach them to the version before submitting.

## Checks

```bash
npx tsc --noEmit                    # typecheck
npm run check:native                # native module versions match the SDK
npx expo export --platform ios      # verify it really bundles
```

### Installing native modules

Always `npx expo install <package>`, never plain `npm install`, for anything with
native code. Expo Go embeds the exact native modules listed in
`node_modules/expo/bundledNativeModules.json`; a JS package on a different major
calls into native methods that aren't there, and it fails at **runtime** with
`native module is null` — after the typecheck and the bundle have both passed.

If `expo install` can't reach Expo's API, read the expected version out of
`bundledNativeModules.json` and pin it exactly. `npm run check:native` compares
what's installed against that file and is the guard either way.

## Icons

`assets/images/*.png` are **generated**, not hand-drawn — `scripts/make-icons.py`
redraws them from the same geometry as `src/components/Logo.tsx`, so the icon
can't quietly drift from the mark inside the app. Change the mark there, then:

```bash
pip install cairosvg
python3 scripts/make-icons.py
```

`icon.png` comes out as RGB with no alpha channel on purpose: App Store Connect
rejects an app icon that has one, even a fully opaque one.

## Building for TestFlight

`eas.json` has three profiles. `production` takes its build number from EAS
(`appVersionSource: remote`) and raises it on every build, so an upload is never
refused for reusing one; `version` in `app.json` is the number people see.

EAS builds from the repository, and `mobile/.env` isn't in it. Give each profile
the three public values once (the anon key and RevenueCat's iOS key are public
by design — RLS and the store protect what matters; never add the service role
key or any secret key here):

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_<key> --visibility plaintext
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

A release build made without them opens on a screen naming what's missing,
instead of running without an account or with nothing to sell.

## Before submitting to the App Store

- `ios.bundleIdentifier` in `app.json` is `com.davigolgher.flow` — change it if you want another.
- Apple Developer Program membership, and `PrivacyInfo.xcprivacy` (template in `../APP_STORE.md`).
