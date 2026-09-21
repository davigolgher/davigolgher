/**
 * Sign-up sanity checks for an email address.
 *
 * None of this proves a mailbox exists — only a message sent to it can do that.
 * What it catches is the mistake that actually costs someone their account: a
 * slip in the address they will one day need to reset their password with.
 *
 * Everything here *suggests*. Nothing blocks on a guess: an address we don't
 * recognise is far more often a domain we haven't heard of than a typo, and
 * refusing those would lock out the people we're trying to help.
 */

/** Shape only — a local part, an @, a domain, and a plausible TLD. */
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;

/** The providers nearly everyone uses, and so the ones nearly all typos aim at. */
const COMMON = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
];

/**
 * Real providers that sit within a couple of edits of a common one.
 *
 * `mail.com` is two edits from `gmail.com` and perfectly real; without this a
 * correct address would be told it looks wrong.
 */
const REAL_LOOKALIKES = new Set(["mail.com", "email.com", "ymail.com", "gmx.com", "gmx.de", "zoho.com", "web.de", "live.co.uk"]);

/** Trim and lower-case, so what's shown matches what Supabase stores. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isEmailShaped(raw: string): boolean {
  const email = normalizeEmail(raw);
  // A doubled dot passes the pattern's character classes but is never valid.
  return SHAPE.test(email) && !email.includes("..");
}

/** Levenshtein distance, two rows. The inputs are domain names, so this is tiny. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/**
 * The address they probably meant, or null.
 *
 * A domain one or two edits from a common provider — `gmial.com`, `gmail.con`,
 * `hotmal.com` — is a slip. Further away than that is simply a domain we don't
 * know, and guessing at those would "correct" perfectly good addresses.
 */
export function suggestEmailFix(raw: string): string | null {
  const email = normalizeEmail(raw);
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || REAL_LOOKALIKES.has(domain)) return null;

  let best: string | null = null;
  let score = Infinity;
  for (const candidate of COMMON) {
    const d = distance(domain, candidate);
    if (d < score) {
      score = d;
      best = candidate;
    }
  }

  return best && score > 0 && score <= 2 ? `${local}@${best}` : null;
}
