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

## Before submitting to the App Store

- Real 1024×1024 icon and splash in `assets/images/` (current ones are Expo placeholders).
- `ios.bundleIdentifier` in `app.json` is `com.davigolgher.flow` — change it if you want another.
- Apple Developer Program membership, and `PrivacyInfo.xcprivacy` (template in `../APP_STORE.md`).
