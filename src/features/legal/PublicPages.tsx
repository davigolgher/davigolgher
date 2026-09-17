/**
 * Public pages — reachable WITHOUT an account.
 *
 * App Store Connect requires a working **Privacy Policy URL**, a **Terms of Use
 * (EULA) URL** for auto-renewable subscriptions, and a **Support URL**. App
 * Review opens them straight from the store listing, so they must not sit
 * behind sign-up. These routes are matched before the sign-up/paywall gate in
 * `App.tsx` for exactly that reason.
 */
import { Link } from "react-router-dom";
import { APP } from "@/config/app";
import { LegalBody, LEGAL_TITLES, type LegalDocId } from "./Legal";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="app-shell flex min-h-full flex-col px-6 pb-16 pt-safe">
      <header className="flex items-center justify-between gap-3 border-b border-line-soft py-4">
        <span className="text-[17px] font-bold tracking-tight text-chalk">{APP.name}</span>
        <Link to="/" className="text-[13px] font-medium text-chalk-mute underline underline-offset-2 hover:text-chalk">
          Open the app
        </Link>
      </header>

      <main className="flex-1 pt-6">
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-chalk">{title}</h1>
        <div className="mt-5">{children}</div>
      </main>

      <footer className="mt-10 border-t border-line-soft pt-5">
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-chalk-mute">
          <Link to="/privacy" className="hover:text-chalk">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-chalk">
            Terms of Service
          </Link>
          <Link to="/ai" className="hover:text-chalk">
            AI Disclosure
          </Link>
          <Link to="/support" className="hover:text-chalk">
            Support
          </Link>
        </nav>
        <p className="mt-3 text-[12px] text-chalk-faint">
          {APP.company || APP.name} · {APP.name} v{APP.version}
        </p>
      </footer>
    </div>
  );
}

/** A legal document as its own public URL (`/privacy`, `/terms`, `/ai`). */
export function LegalPage({ doc }: { doc: LegalDocId }) {
  return (
    <Shell title={LEGAL_TITLES[doc]}>
      <LegalBody doc={doc} />
    </Shell>
  );
}

function Block({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-ink-850 p-4">
      <h2 className="text-[15px] font-semibold text-chalk">{heading}</h2>
      <div className="mt-2 space-y-2 text-[14px] leading-relaxed text-chalk-mute">{children}</div>
    </section>
  );
}

/** Public support page (`/support`) — the Support URL for the store listing. */
export function SupportPage() {
  const email = APP.supportEmail;
  return (
    <Shell title="Support">
      <div className="space-y-4">
        <Block heading="Contact us">
          {email ? (
            <p>
              Email{" "}
              <a href={`mailto:${email}`} className="font-medium text-chalk underline underline-offset-2">
                {email}
              </a>{" "}
              and we&apos;ll get back to you. Include your account email and, if it&apos;s about a charge, the date of
              the payment.
            </p>
          ) : (
            <p>
              A support address hasn&apos;t been set for this build yet. Set <code>APP.supportEmail</code> in{" "}
              <code>src/config/app.ts</code> before submitting to the App Store — Apple requires a Support URL with a
              contact that actually reaches you.
            </p>
          )}
        </Block>

        <Block heading="Cancel your subscription">
          <p>
            Cancelling takes the same number of taps as subscribing, and you keep access until the end of the period
            you already paid for.
          </p>
          <p>
            <span className="font-medium text-chalk">Subscribed on the web:</span> open {APP.name} → Settings → Manage
            subscription. That opens the billing portal, where you can cancel immediately.
          </p>
          <p>
            <span className="font-medium text-chalk">Subscribed through the App Store:</span> cancel in iOS Settings →
            your name → Subscriptions → {APP.name}. Purchases made through Apple can only be cancelled there.
          </p>
        </Block>

        <Block heading="Delete your account">
          <p>
            Open {APP.name} → Settings → Delete account. This erases your expenses, subscriptions, budgets and any
            receipt files you uploaded. It cannot be undone.
          </p>
          <p>
            Deleting the account does not by itself cancel an App Store subscription — cancel that first, using the
            steps above, so you aren&apos;t charged again.
          </p>
        </Block>

        <Block heading="Your data and privacy">
          <p>
            We don&apos;t sell your data and we don&apos;t use data brokers. What we collect, why, and who processes it
            is listed in the{" "}
            <Link to="/privacy" className="font-medium text-chalk underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </Block>
      </div>
    </Shell>
  );
}
