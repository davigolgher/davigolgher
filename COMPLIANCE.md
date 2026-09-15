# Compliance checklist — "10 ways your app gets sued"

Status of each item against Flow. ✅ handled in the app · ⚙️ needs the backend
live (code is scaffolded) · ✔️ already done in backend config.

| # | Item | Status | Where / what |
|---|------|--------|--------------|
| 1 | **No Privacy Policy** | ✅ | Full Privacy Policy in Settings → Legal & privacy, linked on the paywall and sign-up. |
| 2 | **No "we collect user data"** | ✅ | Privacy Policy → "Data we collect" lists email, financial data, uploaded files, Gmail, diagnostics. |
| 3 | **No mention of AI in the Privacy Policy** | ✅ | Added "Automated processing & AI" to the Privacy Policy (plus the standalone AI Disclosure). |
| 4 | **No mention of third-party data collectors** | ✅ | Privacy Policy → "Third-party service providers" names Supabase, Stripe, Google; states no sale / no data brokers. |
| 5 | **Not deleting user uploads** | ✅ + ⚙️ | Delete account clears rows **and** removes the user's receipt files from storage (`deleteAllData`). Runs live once storage uploads are enabled. |
| 6 | **Storage bucket = public** | ✔️ | The `receipts` bucket is **private** with owner-scoped RLS (`supabase/migrations/0002_storage.sql`). |
| 7 | **Fake testimonials** | ✅ | Removed the unsubstantiated social-proof line on the paywall; no fabricated reviews anywhere. The rating prompt is a real, first-party prompt. |
| 8 | **Cancelling harder than signing up** | ✅ + ⚙️ | "Manage subscription" opens the **Stripe Billing Portal** (one-tap cancel) via `create-portal`; on the App Store, cancel is in App Store → Subscriptions. Disclosed at purchase. |
| 9 | **Auto-renew without reminder** | ⚙️ | Auto-renew terms are disclosed at purchase (Guideline 3.1.2). A **reminder before the charge** needs a scheduled job + email/push (backend). Apple also sends its own IAP renewal notices. |
| 10 | **AI with no self-harm response** | ✅ (N/A) | Flow has **no chat/conversational AI**, so there's no message surface to mishandle. Documented in the AI Disclosure; if a chat is added, crisis messages must surface support resources. |

## What still needs the backend to be *live*

Everything below is coded/scaffolded; it activates when you connect Supabase/Stripe
(see `SUPABASE.md`). Nothing here blocks the local demo.

- **#5 upload deletion** — the delete flow removes storage files; it does real work
  once receipts are uploaded to the `receipts` bucket (upload wiring is the remaining step).
- **#6 private bucket** — created private by the migration; applies when you run it.
- **#8 easy cancel** — the Stripe Billing Portal function must be deployed and its
  secret set; App Store cancellation is native.
- **#9 renewal reminder** — needs a scheduled function (e.g. Supabase cron) that reads
  `billing.current_period_end` and sends an email/push a few days before renewal.
- **#10 self-harm handling** — only applies if you add a conversational AI; that AI
  would run server-side and must screen for crisis content.

## Already-safe posture (from earlier work)

Input sanitization, file-upload validation (type/size/magic-byte), https-only
navigation, RLS on every table, secret keys only in Edge Function env, account
deletion, binding-arbitration + UGC-liability terms, and an App Store privacy label.
See `SECURITY.md` and `APP_STORE.md`.
