/**
 * The cryptography the bank providers need, on WebCrypto only (the same API
 * in Deno, where the functions run, and in Node, where they're tested).
 *
 *   · sealSecret / openSecret — AES-256-GCM for the access tokens Plaid hands
 *     back per connection. The key (BANK_TOKEN_KEY, 32 random bytes in
 *     base64) exists only as an Edge Function secret, so the database alone
 *     holds nothing usable.
 *   · verifyPlaidJwt — Plaid signs every webhook with an ES256 JWT in the
 *     `Plaid-Verification` header; the claims carry the body's SHA-256.
 *   · rsaSign / rsaVerify — Salt Edge signs its callbacks with RSA-SHA256, and
 *     in live mode asks that requests to it be signed the same way.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64decode(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── Secrets at rest ───────────────────────────────────────────────────── */

const SEAL_VERSION = "v1";

async function aesKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64decode(keyB64);
  if (raw.length !== 32) throw new Error("BANK_TOKEN_KEY must be 32 bytes, base64-encoded");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** "v1:" + base64(iv ‖ ciphertext+tag). A fresh random IV every time. */
export async function sealSecret(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(keyB64), enc.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `${SEAL_VERSION}:${b64encode(out)}`;
}

export async function openSecret(sealed: string, keyB64: string): Promise<string> {
  const [version, body] = sealed.split(":", 2);
  if (version !== SEAL_VERSION || !body) throw new Error("Unknown secret format");
  const raw = b64decode(body);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await aesKey(keyB64), raw.slice(12));
  return dec.decode(plain);
}

/* ── JWT (ES256), for Plaid's webhooks ─────────────────────────────────── */

export interface Jwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid?: string;
  alg?: string;
  expired_at?: number | null;
}

export function jwtHeader(token: string): { alg?: string; kid?: string } | null {
  try {
    return JSON.parse(dec.decode(b64decode(token.split(".")[0] ?? "")));
  } catch {
    return null;
  }
}

/**
 * Check a Plaid webhook: ES256 signature by the key Plaid published, issued
 * within the last five minutes, and covering exactly this body.
 */
export async function verifyPlaidJwt(token: string, key: Jwk, body: string, now: number = Date.now()): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const header = jwtHeader(token);
  if (header?.alg !== "ES256") return false;
  if (key.expired_at && key.expired_at * 1000 < now) return false;
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: key.kty, crv: key.crv, x: key.x, y: key.y, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    b64decode(parts[2]),
    enc.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) return false;
  let claims: { iat?: number; request_body_sha256?: string };
  try {
    claims = JSON.parse(dec.decode(b64decode(parts[1])));
  } catch {
    return false;
  }
  if (typeof claims.iat !== "number" || now / 1000 - claims.iat > 5 * 60) return false;
  const digest = await sha256Hex(body);
  return typeof claims.request_body_sha256 === "string" && constantTimeEqual(claims.request_body_sha256, digest);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ── RSA-SHA256, for Salt Edge ─────────────────────────────────────────── */

function pemBody(pem: string): Uint8Array<ArrayBuffer> {
  return b64decode(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""));
}

const RSA = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

/** Sign with a PKCS#8 private key (PEM). Base64 signature. */
export async function rsaSign(privateKeyPem: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemBody(privateKeyPem), RSA, false, ["sign"]);
  return b64encode(new Uint8Array(await crypto.subtle.sign(RSA, key, enc.encode(data))));
}

/** Verify a base64 signature with an SPKI public key (PEM). */
export async function rsaVerify(publicKeyPem: string, data: string, signatureB64: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("spki", pemBody(publicKeyPem), RSA, false, ["verify"]);
    return await crypto.subtle.verify(RSA, key, b64decode(signatureB64), enc.encode(data));
  } catch {
    return false;
  }
}
