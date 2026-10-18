# Security & privacy notes

This documents the security measures built into Flow and the ones that **must**
live on the server. Flow is a native app (`mobile/`) talking to Supabase, so
anything depending on a secret runs in an Edge Function — never shipped in the
app, where it could simply be read out of the bundle.

> The latest security audit — findings, evidence, what's still to do on the
> Supabase, RevenueCat and Vercel dashboards, and what wasn't verified — is in
> [SEGURANCA.md](SEGURANCA.md) (28/09/2026, in Portuguese). The isolation and
> input-limit checks it ran can be re-run from `supabase/tests/`.

## In the app (client-side)

- **Input sanitization** (`src/lib/sanitize.ts`) — all user-entered text (merchant,
  category, note, email, subscription name) is cleaned at the store boundary:
  control/zero-width characters and bidirectional-override spoofing are stripped and
  lengths are capped. React escapes text on render, so this is defense-in-depth.
- **Guarded navigation** — outbound links go through `safeHttpUrl()`, so only
  `https:`/`http:` URLs are followed (blocks `javascript:` / `data:` schemes).
- **File-upload checks** (`src/lib/upload.ts`) — validates size (≤ 8 MB), an
  allowlisted MIME type, a matching extension, **and a magic-byte sniff** so a renamed
  file can't pose as an image; filenames are stripped of path segments and unsafe
  characters, and SVG is deliberately not allowed (script risk). Written and tested,
  but **nothing in the app uploads anything today** — there is no attachment feature,
  so this is groundwork, not a live defence. The app asks for no camera or photo
  permission for the same reason.
- **Account deletion** — Settings → Account → Delete account removes the rows,
  the uploaded files **and the auth user**, through the `delete-account` Edge
  Function, once the password typed there has been checked by the function. The
  client can't delete the user itself (that needs the service role key), and
  deleting only the data would leave the login alive — which Apple treats as not
  having deleted the account (Guideline 5.1.1(v)).
- **Session in the Keychain** — the Supabase session (refresh token) is stored
  with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: never in backups or on another
  phone, and discarded if the app is deleted and reinstalled.
- **Nothing on show outside the app** — a white cover hides the screen in the
  app switcher; renewal notifications leave amounts out unless the person turns
  "Show amounts" on; sync warnings are printed in development builds only.
- **Re-authentication** — changing the password asks for the current one;
  deleting the account asks for the password.
- **HTTPS only** — store builds drop the local-network exception from App
  Transport Security (`mobile/app.config.js`).
- **Legal/compliance surfaces** — Terms (Brazilian law, the consumer's own
  courts, no mandatory arbitration), Privacy Policy, an AI disclosure, and an
  Apple-style privacy nutrition label, all in Settings → Legal.

> Client-side checks improve UX and stop casual abuse, but they are **not** a security
> boundary. Every check below must be **repeated on the server** once a backend exists.

## Must be server-side (do NOT put in the frontend)

### Authenticate every webhook before trusting it

A billing webhook is an unauthenticated public endpoint that grants paid access.
Anything that can reach it can claim a user is subscribed, so the payload is only
worth acting on once the sender is proven.

Flow's subscriptions run on Apple IAP through **RevenueCat**, whose webhook
authenticates with a shared secret sent in the `Authorization` header. Set it in
RevenueCat, store it as an Edge Function secret, and compare in constant time —
`===` on a secret leaks its prefix through timing.

```ts
// supabase/functions/revenuecat-webhook/index.ts
const EXPECTED = Deno.env.get("REVENUECAT_WEBHOOK_SECRET")!;

/** Constant-time compare; a plain === leaks how many characters matched. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (!safeEqual(req.headers.get("Authorization") ?? "", EXPECTED)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const event = await req.json();
  // ...write the entitlement to `billing` using the service-role key...
  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
```

Deploy it with `--no-verify-jwt` (RevenueCat has no Supabase session), make the
handler **idempotent** — events get retried and can arrive out of order — and
return 2xx only after the event is stored. The same rules apply to any other
provider's webhook; only the proof of origin differs (HMAC over the raw body for
some, a shared secret for others).

### Other server responsibilities

- **Re-validate uploads** (size, MIME, magic bytes, and re-encode/scan images); store
  them outside the web root and serve with a strict `Content-Type` and
  `Content-Disposition: attachment`.
- **Authentication & authorization** — real accounts, sessions, and per-user access
  checks; never trust the client for who the user is.
- **Secrets** — the Supabase *service role* key, RevenueCat's webhook secret and
  secret API key, and any DB credentials belong in server env only. Only
  anon/publishable keys may appear client-side.
- **Account deletion** — cascade the delete across the database and purge backups on a
  defined schedule to honor the Privacy Policy.
- **Security headers / CSP** — the legal and support site sends a strict
  Content-Security-Policy, `X-Content-Type-Options: nosniff`, HSTS and frame
  protections, set in `vercel.json`.

## Reporting

Security issues: `golgherbusiness@gmail.com`. Please do not open a public issue
for vulnerabilities.
