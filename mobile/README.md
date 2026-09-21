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

The paywall, the gate, the restore path and the entitlement check are built. What
is missing is the native module, deliberately: `react-native-purchases` is not in
Expo Go, so installing it ends QR-code testing and forces a development build for
every change. Until then `src/lib/purchases.ts` reports the store unavailable, the
paywall shows no prices, and a dev build can step past it.

To finish it, in this order:

1. **Apple Developer Program** (~US$99/yr), then in **App Store Connect** create
   two auto-renewable subscriptions in one group (monthly and yearly), each with
   the free trial as an introductory offer.
2. **RevenueCat**: create the project, add the App Store app, upload the
   in-app-purchase key, and make an **entitlement** (`pro`) containing both
   products, exposed through an **offering**.
3. **Webhook**: RevenueCat → Integrations → Webhooks →
   `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`, with a secret in
   the Authorization field. Same value as `REVENUECAT_WEBHOOK_SECRET` in Supabase.
4. **Install and wire**:
   ```bash
   npx expo install react-native-purchases
   ```
   then fill in `loadNativePurchases()` in `src/lib/purchases.ts` — that function
   is the whole integration point. Read prices from `getOfferings()`; never type a
   price into the repo, since App Review requires the storefront's own localized
   price at the point of purchase.
5. **Development build** — purchases cannot run in Expo Go:
   ```bash
   npx expo install expo-dev-client
   eas build --profile development --platform ios
   ```
   Test with a **sandbox tester** account from App Store Connect.

`Purchases.logIn(supabaseUserId)` matters: it makes RevenueCat's `app_user_id`
the Supabase user id, which is how the webhook knows whose `billing` row to write.

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

## Before submitting to the App Store

- `ios.bundleIdentifier` in `app.json` is `com.davigolgher.flow` — change it if you want another.
- Apple Developer Program membership, and `PrivacyInfo.xcprivacy` (template in `../APP_STORE.md`).
