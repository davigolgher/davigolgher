# Flow Família — notas para a revisão das lojas

Para colar em App Store Connect → App Review Information → Notes (e no campo
equivalente do Play Console). Em inglês, idioma do app. Substitua o que está
entre `<>`. As contas são criadas com `node supabase/scripts/seed-demo-family.ts`.

---

**Flow Family (new in this version)**

Flow Family lets a guardian follow, read-only, the spending of someone they look after (a child, a teenager, an older parent) from the bank accounts that person chooses to share through Open Finance Brasil. It cannot move money, block purchases, issue cards or see bank credentials. Bank connections go through Pluggy (pluggy.ai), an authorised Open Finance connection provider; the bank login is typed into Pluggy's or the bank's own screen and never reaches us.

**Demo accounts** (already set up with a family, a dependent and fictitious bank data; nothing here is a real person or bank):

- Guardian: `<flow.review.guardian@example.com>` / `<password>` — has an active Flow subscription, so every feature is visible.
- Dependent: `<flow.review.dependent@example.com>` / `<password>`

**Where to find it**

- Guardian (subscribed): Settings → Family → Flow Family. Tap "Ana (demo)" for the month against the previous one, spending by category, budgets, the list of purchases and, at the bottom, the monthly PDF report. "Alerts" on the Flow Family screen shows the alert rules and the alerts received. The Home tab also has a Flow Family card.
- Dependent (not subscribed): after signing in, the subscription screen offers "Here for Flow Family? Continue free". That opens Flow Family only (the free plan); the rest of Flow stays behind the subscription. The first screen says who can see their spending and until when. "Sharing" shows who can see what, every time the guardian opened the data (Access history), the alerts and limits set about them, "Stop sharing" (immediate), "Leave family" and "Download my data". "Account" (top right) has sign out, account deletion and the legal documents.
- A subscriber who is a dependent sees "Shared with …" on the Home tab at all times; it can't be dismissed.

**Connecting a bank (optional)**: signed in as the dependent, Flow Family → Bank accounts → "Connect another bank" opens Pluggy's widget, which lists Pluggy's sandbox bank for this demo account only. Choose "Pluggy Bank" and sign in with `user-ok` / `password-ok`. No real bank is involved.

**Consent and transparency**

- Nothing is shared until the dependent reads the terms (what is shared, what never is, with whom, for how long, how to stop) and agrees. The agreement is recorded with date, terms version and network address. For under-18s, a parent or legal guardian consents when inviting, and the young person confirms.
- The monitoring is never hidden: the dependent sees it on Home at all times and on the Sharing page, including an access history.
- Notifications to the guardian never contain amounts, merchants or categories ("New alert about Ana. Open Flow to see it.").

**Not a hidden feature**: Flow Family is enabled at build time for this binary; there is no server-side switch that changes the app after review.

**Account deletion**: Settings → Delete account (or Family → Account → Delete account for Family-only users). It deletes the account and its data and ends the person's bank connections with Pluggy.

**Money management (3.2.1)**: the app only reads transactions the account holder chose to share; it offers no payments, transfers, trading, loans or credit.

Contact: golgherbusiness@gmail.com
