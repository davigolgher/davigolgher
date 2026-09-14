# Security & privacy notes

This documents the security measures built into Flow and the ones that **must** live
on a backend. The app currently runs fully client-side (no server, data in-memory),
so anything that depends on a secret or a trusted environment is documented here as a
server responsibility — never shipped in the frontend.

## In the app today (client-side)

- **Input sanitization** (`src/lib/sanitize.ts`) — all user-entered text (merchant,
  category, note, email, subscription name) is cleaned at the store boundary:
  control/zero-width characters and bidirectional-override spoofing are stripped and
  lengths are capped. React escapes text on render, so this is defense-in-depth.
- **No dangerous sinks** — no `dangerouslySetInnerHTML`; the only navigation
  (`window.location.assign`) is guarded by `safeHttpUrl()` so only `https:`/`http:`
  URLs are ever followed (blocks `javascript:` / `data:` schemes).
- **File-upload checks** (`src/lib/upload.ts`) — receipt attachments are validated for
  size (≤ 8 MB), an allowlisted MIME type, a matching extension, **and a magic-byte
  sniff** so a renamed file can't pose as an image. Filenames are stripped of path
  segments and unsafe characters. SVG is intentionally **not** allowed (script risk),
  and receipts are only rendered via `<img>`, never inlined.
- **Account deletion** — Settings → Account → Delete account erases all local data.
- **Legal/compliance surfaces** — Terms (with a binding-arbitration clause and a
  user-generated-content liability disclaimer), Privacy Policy, an FTC-style AI
  disclosure, and an Apple-style privacy nutrition label, all in Settings → Legal.

> Client-side checks improve UX and stop casual abuse, but they are **not** a security
> boundary. Every check below must be **repeated on the server** once a backend exists.

## Must be server-side (do NOT put in the frontend)

### Stripe webhook signature verification

Only accept webhook events that Stripe actually signed. Verify the `Stripe-Signature`
header against the **raw** request body using your endpoint's signing secret
(`whsec_…`), which lives only in server env vars. Never trust the event body without it.

**Node / Express**

```js
import express from "express";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; // whsec_...
const app = express();

// IMPORTANT: the raw body is required — do not JSON-parse before verifying.
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    // Signature invalid, body tampered, or timestamp outside tolerance.
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // ...update the user's subscription state from the verified event...
      break;
  }
  res.json({ received: true });
});
```

**Supabase Edge Function (Deno)**

```ts
import Stripe from "https://esm.sh/stripe@16?target=deno";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text(); // raw body
  try {
    const event = await stripe.webhooks.constructEventAsync(body, sig, secret);
    // handle verified event...
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }
});
```

Notes: keep the default timestamp tolerance (replay protection), make handlers
idempotent (Stripe may retry), and return 2xx only after the event is safely stored.

### Other server responsibilities

- **Re-validate uploads** (size, MIME, magic bytes, and re-encode/scan images); store
  them outside the web root and serve with a strict `Content-Type` and
  `Content-Disposition: attachment`.
- **Authentication & authorization** — real accounts, sessions, and per-user access
  checks; never trust the client for who the user is.
- **Secrets** — Stripe *secret* key, webhook signing secret, Google OAuth *client
  secret*, and any DB credentials belong in server env only. Only publishable/anon
  keys and OAuth *client IDs* may appear client-side.
- **Account deletion** — cascade the delete across the database and purge backups on a
  defined schedule to honor the Privacy Policy.
- **Security headers / CSP** — send a Content-Security-Policy, `X-Content-Type-Options:
  nosniff`, HSTS, and frame protections from the server hosting the app.

## Reporting

Security issues: `security@flow.app` (replace with your address). Please do not open a
public issue for vulnerabilities.
