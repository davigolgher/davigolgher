# App Store submission checklist (Flow)

Flow today is a web app (Vite + React). Shipping to the App Store means wrapping it
in a native shell (Expo/Capacitor → Xcode) and submitting through App Store Connect.
This maps Apple's current requirements to what is **already handled in the app** vs.
what must be done in the **native build / App Store Connect**.

Sources:
- [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Preparing your app for distribution](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution)
- [Distributing for beta testing and releases](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

## Already handled in the app ✅

- **Account deletion in-app** (required since Jun 30, 2022) — Settings › Account › Delete account, available to all users, erases the account/data, and warns to cancel an App Store subscription first.
- **Sign in with Apple offered** alongside Google (Guideline 4.8 "Login Services").
- **Privacy Policy, Terms of Use (EULA), AI disclosure, privacy nutrition label** — in Settings › Legal & privacy.
- **Subscription disclosure at the point of purchase** (Guideline 3.1.2) — the paywall states trial length, price/period, auto-renew, and how to cancel, with functional **Terms of Use** and **Privacy Policy** links. Sign-up screen links to both too.
- **Restore purchases** and **Manage subscription** affordances in Settings (UI; wire to StoreKit in the native build).
- **File-upload validation** for receipts (type/size/magic-byte), input sanitization, https-only navigation (see `SECURITY.md`).

## Native build / App Store Connect — TODO

### 1. Payments — the big decision (Guideline 3.1.1)
Digital subscriptions consumed in the app must use **Apple In-App Purchase (StoreKit)**, *or* the **StoreKit External Purchase Link Entitlement** where allowed (e.g. US). A Stripe-only in-app subscription will be rejected. Decide:
- **IAP/StoreKit** — implement products, purchase, and Restore; Apple takes commission.
- **External Purchase Link entitlement** — request the entitlement, show the required disclosure sheet, keep payment on your Stripe page (the app already redirects to a hosted Stripe link, kept outside the app for this reason).

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
