/**
 * Text hygiene for user-entered values.
 *
 * React already escapes text when it renders it as element children, so this is
 * defense-in-depth, not the only line of defense: it removes control and
 * zero-width characters, neutralizes bidirectional-override spoofing, collapses
 * whitespace, and caps length before a value is stored or shown. Apply it at the
 * write boundary (the store), so every screen reads already-clean data.
 *
 * Implemented with numeric code-point checks (no regex escapes) so the rules are
 * explicit and portable.
 */

const LF = String.fromCharCode(10);

// Disallowed: C0 controls (except tab/newline), DEL + C1 controls.
function isControl(c: number): boolean {
  if (c === 9 || c === 10) return false; // keep tab and newline
  if (c < 32) return true;
  return c >= 127 && c <= 159;
}

// Disallowed: zero-width chars, BOM, and bidirectional override/isolate spoofing.
function isInvisible(c: number): boolean {
  if (c === 0x200b || c === 0x200c || c === 0x200d || c === 0x2060 || c === 0xfeff) return true;
  if (c >= 0x202a && c <= 0x202e) return true;
  return c >= 0x2066 && c <= 0x2069;
}

function strip(input: unknown): string {
  if (typeof input !== "string") return "";
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    if (isControl(c) || isInvisible(c)) continue;
    out += ch;
  }
  return out;
}

function collapseSpaces(line: string): string {
  let out = "";
  let prevSpace = false;
  for (const ch of line) {
    const c = ch.codePointAt(0) ?? 0;
    const isSpace = c === 9 || c === 10 || c === 13 || c === 32;
    if (isSpace) {
      if (!prevSpace) out += " ";
      prevSpace = true;
    } else {
      out += ch;
      prevSpace = false;
    }
  }
  return out.trim();
}

/** Single-line field (names, merchants, categories, email…). */
export function sanitizeText(input: unknown, maxLen = 200): string {
  const s = collapseSpaces(strip(input));
  return s.length > maxLen ? s.slice(0, maxLen).trim() : s;
}

/** Multi-line field (notes). Keeps single newlines; caps blank-line runs. */
export function sanitizeMultiline(input: unknown, maxLen = 1000): string {
  const lines = strip(input)
    .split(LF)
    .map((line) => {
      let out = "";
      let prevSpace = false;
      for (const ch of line) {
        const c = ch.codePointAt(0) ?? 0;
        const isSpace = c === 9 || c === 32;
        if (isSpace) {
          if (!prevSpace) out += " ";
          prevSpace = true;
        } else {
          out += ch;
          prevSpace = false;
        }
      }
      return out.trim();
    });

  const kept: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    if (line === "") {
      blanks += 1;
      if (blanks <= 1) kept.push("");
    } else {
      blanks = 0;
      kept.push(line);
    }
  }
  const text = kept.join(LF).trim();
  return text.length > maxLen ? text.slice(0, maxLen).trim() : text;
}

/**
 * Return the URL only if it is a plain http(s) link — blocks `javascript:`,
 * `data:`, `vbscript:` and other script-bearing schemes before a value is ever
 * put into an href or handed to the browser to navigate.
 */
export function safeHttpUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
