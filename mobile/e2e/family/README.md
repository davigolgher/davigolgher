# Flow Family — end-to-end flows (Maestro)

Device-level flows for the acceptance path: invite → consent → connect a
sandbox bank → the guardian sees spending → the dependent stops sharing → the
guardian loses access. They drive a real build against a real (staging)
Supabase project and Pluggy's **sandbox** — never real people or banks.

They can't run in the cloud session where they were written (no simulator,
no network to Pluggy); run them on a Mac with a simulator, or on Maestro Cloud.

## Setup

1. A staging Supabase project with migrations 0001–0015 and the five Flow
   Family functions deployed (see `docs/flow-familia/progresso.md`).
2. Two test accounts, e.g. from the demo seed
   (`node supabase/scripts/seed-demo-family.ts` creates them), and the
   dependent's id in `PLUGGY_SANDBOX_USER_IDS`.
3. A development build with `EXPO_PUBLIC_FLOW_FAMILY=1`:
   `eas build --profile development --platform ios` (or a simulator build).
4. Install Maestro: `curl -fsSL "https://get.maestro.mobile.dev" | bash`.

## Run

```bash
export GUARDIAN_EMAIL=… GUARDIAN_PASSWORD=… DEPENDENT_EMAIL=… DEPENDENT_PASSWORD=…
maestro test mobile/e2e/family/01-guardian-invites.yaml        # note the code on screen
INVITE_CODE=ABCD2345 maestro test mobile/e2e/family/02-dependent-consents-and-connects.yaml
maestro test mobile/e2e/family/03-guardian-sees-spending.yaml
maestro test mobile/e2e/family/04-dependent-stops-sharing.yaml
maestro test mobile/e2e/family/05-guardian-lost-access.yaml
```

Pass `-e` to override any variable. Flow 02 uses Pluggy's sandbox bank
("Pluggy Bank", login `user-ok` / `password-ok`, as Pluggy's sandbox
documents); if Pluggy renames them, adjust the two `inputText` lines.

## What's covered without a device

The same paths are exercised in CI-friendly tests that run with `npm test`:

| Path | Test |
| --- | --- |
| Invite, consent with IP/version/date, revoke, expire, minors | `supabase/tests/pg/family_core.test.ts` |
| Another family can't read anything; guardian only through audited reads | `supabase/tests/pg/family_bank.test.ts` |
| Connect token, sync, webhook (secret, dedupe, re-read), push, disconnect, account deletion with Pluggy | `supabase/tests/pg/family_sync.test.ts` |
| Alert rules and push bookkeeping | `supabase/tests/pg/family_alerts.test.ts` |
| Export, retention, unshared connections | `supabase/tests/pg/family_privacy.test.ts` |
| Demo accounts for review | `supabase/tests/pg/family_demo.test.ts` |
| Screens: states, consent gating, stop sharing, dashboard, flag off | `mobile/src/features/family/*.test.tsx` |
