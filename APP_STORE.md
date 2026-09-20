# App Store submission checklist (Flow)

Flow is a **native app** (Expo / React Native, in `mobile/`) — real native views,
not a wrapped web page, so Guideline 4.2 ("minimum functionality") doesn't apply.
This maps Apple's requirements to what is **already handled in the app** vs. what
must still be done in the **build / App Store Connect**.

Sources:
- [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Preparing your app for distribution](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution)
- [Distributing for beta testing and releases](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

## Already handled in the app ✅

- **Account deletion in-app** (required since Jun 30, 2022) — Settings › Account › Delete account, available to all users, erases the account and data, and warns to cancel an App Store subscription first.
- **Privacy Policy, Terms of Use (EULA), AI disclosure, privacy nutrition label** — Settings › Legal & privacy, and at public URLs for the store listing.
- **Public Privacy Policy and Support URLs** — `/privacy` and `/support`, reachable with no account, which is what App Review opens from the listing.
- **Camera / photo-library purpose strings** — `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` in `mobile/app.json`.
- **Export compliance** — `ITSAppUsesNonExemptEncryption: false` (standard HTTPS only).
- **Per-user data isolation** — Row Level Security (`auth.uid() = user_id`) on all 8 tables.
- **Input sanitization** and receipt upload validation helpers (type/size/magic-byte) — see `SECURITY.md`.

## Not done yet ⚠️

Listed separately so this file is not mistaken for a green light:

- **Sign in with Apple (Guideline 4.8)** — required *if* a third-party login is offered. The app signs in with email and password only, so 4.8 doesn't bite yet; adding Google login makes Sign in with Apple mandatory.
- **The purchase itself** — the paywall, its disclosure, Restore Purchases and the entitlement gate are built, but `react-native-purchases` isn't installed (it isn't in Expo Go) and the App Store Connect products don't exist. See `mobile/README.md` → Subscriptions for the ordered steps. Until then the paywall shows no prices, by design: a hard-coded price would be wrong in every other storefront.
- **Receipt photo capture and upload** — helpers exist, the native flow does not.

## Native build / App Store Connect — TODO

### 1. Payments — Apple In-App Purchase (Guideline 3.1.1)
**Apple IAP via StoreKit, wrapped by RevenueCat.** Digital subscriptions consumed
in the app must go through IAP; a Stripe-only in-app subscription is rejected.
Apple takes 15–30%.

Built:
- Paywall with the 3.1.2 disclosure (length, price, period, auto-renew, how to cancel) and working Terms / Privacy links.
- **Restore Purchases** on the paywall, and **Manage subscription** in Settings, deep-linking to the App Store.
- Entitlement gate reading the store first and the `billing` table second.
- `revenuecat-webhook` Edge Function writing entitlements into `billing`.

Remaining, in order — see `mobile/README.md` → Subscriptions:
- App Store Connect: the two auto-renewable products and their introductory offer.
- RevenueCat: project, entitlement, offering, webhook secret.
- `npx expo install react-native-purchases`, then fill in `loadNativePurchases()`.
- A development build (`expo-dev-client` + EAS) — purchases cannot run in Expo Go — and a sandbox tester to try it.

Note: there is no web purchase path, so nothing in the app links out to an
external payment page.

### 2. Privacy manifest — `PrivacyInfo.xcprivacy` (required since May 1, 2024)
Declare collected data types and **required-reason APIs**. Starter template (adjust to your SDKs):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key><false/>
  <key>NSPrivacyTrackingDomains</key><array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeOtherFinancialInfo</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>C617.1</string></array>
    </dict>
  </array>
</dict>
</plist>
```

Keep the **App Privacy** answers in App Store Connect consistent with this file and with the in-app nutrition label.

### 3. Info.plist keys
- `NSPhotoLibraryUsageDescription` and/or `NSCameraUsageDescription` — needed because receipts can be attached (photo/camera). Write a clear, specific reason string.
- `ITSAppUsesNonExemptEncryption` — set for **export compliance**; if the app only uses standard HTTPS/TLS it's typically exempt (`false`), otherwise complete the compliance docs.
- `CFBundleShortVersionString` / `CFBundleVersion`, `UILaunchScreen`, bundle id (`com.yourco.flow`).

### 4. SDK / toolchain (deadline **Apr 28, 2026**)
Build with **Xcode 26+** using the **iOS 26 SDK** (and iPadOS/tvOS/etc. 26 as applicable).

### 5. Age rating (deadline **Jan 31, 2026**)
Answer the **updated age-rating questionnaire** in App Store Connect to avoid submission interruptions.

### 6. EU Digital Services Act
Provide and verify **trader status** in App Store Connect (required to distribute/update in the EU).

### 7. Store metadata & assets
1024×1024 app icon (no alpha), device screenshots, description, keywords, subtitle, **support URL** and **privacy policy URL** (host the in-app policy publicly too), category, and — for auto-renewable subscriptions — the required subscription info and a link to the Terms of Use (EULA) in the description.

### 8. TestFlight (beta) → release
Set up App Store Connect, answer **export-compliance** questions, add **beta app description** and **test information** (contact + notes), invite testers, then submit the build for App Review and release.

---

> Legal texts in the app are templates for your counsel to finalize; App Store metadata (privacy answers, ratings, trader status) is filled in App Store Connect, not in code.
