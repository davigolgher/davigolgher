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
- **Export compliance** — `ITSAppUsesNonExemptEncryption: false` (standard HTTPS only).
- **Per-user data isolation** — Row Level Security (`auth.uid() = user_id`) on all 8 tables.
- **Input sanitization**, and upload validation helpers (type/size/magic-byte) kept for any future attachment feature — see `SECURITY.md`. The app has no attachments today, so it declares no camera or photo-library permission.

## Not done yet ⚠️

Listed separately so this file is not mistaken for a green light:

- **Sign in with Apple (Guideline 4.8)** — required *if* a third-party login is offered. The app signs in with email and password only, so 4.8 doesn't bite yet; adding Google login makes Sign in with Apple mandatory.
- **The subscription products** — the app is free to download and requires a subscription. The purchase code is in (`react-native-purchases`, wired to the account); what's missing is outside the code: the Paid Apps Agreement, the two products in App Store Connect, RevenueCat, and the webhook secret. See `mobile/README.md` → Subscriptions for the ordered steps. Until they exist the paywall shows no prices, by design: a hard-coded price would be wrong in every other storefront.

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
- The public iOS key in EAS as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (the code is in: `mobile/src/lib/purchases.ts`).
- A TestFlight build — purchases don't run in Expo Go — and a sandbox tester to try it.

Note: there is no web purchase path, so nothing in the app links out to an
external payment page.

### 2. Privacy manifest — `PrivacyInfo.xcprivacy` (required since May 1, 2024)
Declared in `mobile/app.json` → `ios.privacyManifests`; `expo prebuild` / EAS
writes it into the app as `PrivacyInfo.xcprivacy`. It says:

- **Tracking:** none, no tracking domains.
- **Collected, linked to the user, for App Functionality only:** Email Address,
  User ID (the account id), Other Financial Info (expenses, income,
  subscriptions, budgets), Other User Content (descriptions, notes, category
  names), Product Interaction (the days the daily review was completed), Other
  Diagnostic Data (Supabase's request logs: IP address and time, with the
  account id from the token, kept for the log retention period — Apple counts
  anything kept past the request as collected, and says to declare IP
  addresses by how they're used).
- **Required-reason APIs** (React Native, AsyncStorage, Expo modules):
  UserDefaults `CA92.1`, file timestamps `C617.1`, system boot time `35F9.1`,
  disk space `E174.1`.

Also **Purchase History** — the subscription plan and status RevenueCat reports
and the webhook stores in `billing`, linked, for app functionality.
Adding a crash reporter or analytics SDK means adding what it collects here too.

Keep the **App Privacy** answers in App Store Connect consistent with this file and
with the in-app nutrition label (`src/features/legal/content.ts`).

### 3. Info.plist keys
- **No camera or photo-library keys.** The app has no attachments, so it asks for neither; declaring a usage string for a capability that's never used is something App Review asks about. Add one only alongside a feature that needs it.
- `ITSAppUsesNonExemptEncryption` — set to `false` in `app.json`: the app only uses standard HTTPS/TLS, which is exempt.
- `CFBundleShortVersionString` / `CFBundleVersion`, `UILaunchScreen`, bundle id (`com.davigolgher.flow`).

### 4. SDK / toolchain (deadline **Apr 28, 2026**)
Build with **Xcode 26+** using the **iOS 26 SDK** (and iPadOS/tvOS/etc. 26 as applicable).

### 5. Age rating (deadline **Jan 31, 2026**)
Answer the **updated age-rating questionnaire** in App Store Connect to avoid submission interruptions.

### 6. EU Digital Services Act
Provide and verify **trader status** in App Store Connect (required to distribute/update in the EU).

### 7. Store metadata & assets
1024×1024 app icon (no alpha), device screenshots, description, keywords, subtitle, **support URL** and **privacy policy URL** (host the in-app policy publicly too), category, and — for auto-renewable subscriptions — the required subscription info and a link to the Terms of Use (EULA) in the description.

### 7b. Store listing — draft (English)

The app's screens are in English (the streak switches to Portuguese on a phone set to Portuguese), so the listing's primary language is English. Counts are within App Store Connect's limits.

- **Name** (30 max): `Flow: Expense Tracker` — "Flow" alone is likely taken; the name must be unique on the store.
- **Subtitle** (30 max): `Budget, bills & subscriptions`
- **Keywords** (100 bytes max, no spaces, none repeated from the name or subtitle): `spending,money,finance,savings,income,monthly,planner,renewal,reminder,habit,report,wallet`
- **Promotional text** (170 max): `Write down what you spend, see where it goes, and never miss a renewal.`
- **Category**: Finance.
- **License Agreement**: leave Apple's standard EULA; its link goes in the description, below.

**Description:**

```
Flow is a calm, simple way to keep track of your money.

Write down what you spend and earn in seconds, set a monthly budget, and see at a glance how much is left. Keep every subscription in one place, with a reminder before each renewal. Monthly reports show where your money goes, by category and over time.

• Expenses and income in two taps
• A monthly budget, with what's left to spend
• Every subscription in one place, with renewal reminders
• Category and month-by-month reports
• A daily review streak that builds the habit — no spending required
• Synced to your account and private by design: no ads, no tracking, no bank connection

Flow doesn't connect to your bank or move money. You write down what matters; Flow does the math.

SUBSCRIPTION
Flow is free to download. Using it requires a Flow Pro subscription, billed monthly or yearly through your Apple ID[, with a free trial for new subscribers]. It renews automatically unless cancelled at least 24 hours before the end of the current period, and your account is charged for the renewal within the 24 hours before it ends. Manage or cancel it at any time in your Apple ID's subscription settings. [If there's a free trial: Any unused part of the free trial is forfeited when you buy a subscription.]

Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/appstore/dev/stdeula/
Terms of Service: https://davigolgher-lmhg.vercel.app/terms
Privacy Policy: https://davigolgher-lmhg.vercel.app/privacy
```

Fill or delete the two bracketed parts to match the products you create, and check that both site links open before submitting.

### 8. TestFlight (beta) → release
Set up App Store Connect, answer **export-compliance** questions, add **beta app description** and **test information** (contact + notes), invite testers, then submit the build for App Review and release.

---

> Legal texts in the app are templates for your counsel to finalize; App Store metadata (privacy answers, ratings, trader status) is filled in App Store Connect, not in code.
