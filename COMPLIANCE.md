# Compliance checklist — "10 ways your app gets sued"

Status of each item against Flow. ✅ handled in the app · ⚙️ needs the backend
live (code is scaffolded) · ✔️ already done in backend config.

| # | Item | Status | Where / what |
|---|------|--------|--------------|
| 1 | **No Privacy Policy** | ✅ | Full Privacy Policy in Settings → Legal & privacy, linked on the paywall and sign-up. |
| 2 | **No "we collect user data"** | ✅ | Privacy Policy → "Data we collect" lists email, financial data, uploaded files, diagnostics. |
| 3 | **No mention of AI in the Privacy Policy** | ✅ | Added "Automated processing & AI" to the Privacy Policy (plus the standalone AI Disclosure). |
| 4 | **No mention of third-party data collectors** | ✅ | Privacy Policy → "Third-party service providers" names Supabase, Apple and RevenueCat; states no sale / no data brokers. |
| 5 | **Not deleting user uploads** | ✅ | The `delete-account` Edge Function removes the rows, the storage files **and** the auth user. |
| 6 | **Storage bucket = public** | ✔️ | The `receipts` bucket is **private** with owner-scoped RLS (`supabase/migrations/0002_storage.sql`). |
| 7 | **Fake testimonials** | ✅ | Removed the unsubstantiated social-proof line on the paywall; no fabricated reviews anywhere. The rating prompt is a real, first-party prompt. |
| 8 | **Cancelling harder than signing up** | ⚙️ | Purchases go through Apple IAP, so cancelling is iOS Settings → your name → Subscriptions → Flow — the same few taps as subscribing, and Apple's own flow. The `/support` page spells out the steps, and the paywall discloses them at the point of purchase. |
| 9 | **Auto-renew without reminder** | ✅ | Auto-renew terms are disclosed at purchase (Guideline 3.1.2), and Settings → Reminders schedules a local notification 1–7 days before each charge — the tracked subscriptions *and* Flow's own renewal. It reads `billing.will_renew`, so a cancelled-but-still-valid subscription isn't warned about a charge that isn't coming. Apple also sends its own IAP renewal notices. |
| 10 | **AI with no self-harm response** | ✅ (N/A) | Flow has **no chat/conversational AI**, so there's no message surface to mishandle. Documented in the AI Disclosure; if a chat is added, crisis messages must surface support resources. |

## What still needs the backend to be *live*

Everything below is coded/scaffolded; it activates when you connect Supabase
(see `SUPABASE.md`). Nothing here blocks the local demo.

- **#5 upload deletion** — the delete flow removes storage files; it does real work
  once receipts are uploaded to the `receipts` bucket (upload wiring is the remaining step).
- **#6 private bucket** — created private by the migration; applies when you run it.
- **#8 easy cancel** — cancellation is Apple's native flow; the paywall still has to
  say so at the point of purchase (Guideline 3.1.2).
- **#9 renewal reminder** — the reminders for tracked subscriptions work now. The one
  for *Flow's own* renewal reads `billing.current_period_end`, which stays empty until
  RevenueCat's webhook writes to it, so that half is live only once IAP is.
- **#10 self-harm handling** — only applies if you add a conversational AI; that AI
  would run server-side and must screen for crisis content.

## Already-safe posture (from earlier work)

Input sanitization, file-upload validation (type/size/magic-byte), https-only
navigation, RLS on every table, secret keys only in Edge Function env, account
deletion, binding-arbitration + UGC-liability terms, and an App Store privacy label.
See `SECURITY.md` and `APP_STORE.md`.
