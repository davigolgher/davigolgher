/**
 * Client-side file-upload checks for receipt attachments.
 *
 * IMPORTANT: client checks improve UX and block obvious abuse, but they are NOT
 * a security boundary — anyone can bypass the browser. A real upload endpoint
 * MUST re-validate size, MIME, and magic bytes on the server, store outside the
 * web root, and serve with a restrictive Content-Type/Content-Disposition. See
 * SECURITY.md.
 *
 * What this does: enforce a size cap, an allowlist of types, a matching file
 * extension, and a magic-byte sniff so a renamed executable can't pose as an
 * image. Filenames are stripped of path segments and unsafe characters.
 */

export interface UploadRule {
  maxBytes: number;
  /** Allowed MIME type -> permitted lowercase extensions. */
  accept: Record<string, string[]>;
}

export const RECEIPT_RULES: UploadRule = {
  maxBytes: 8 * 1024 * 1024, // 8 MB
  accept: {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "application/pdf": ["pdf"],
  },
};

const BACKSLASH = String.fromCharCode(92);
const FORBIDDEN = new Set<number>([0x3c, 0x3e, 0x3a, 0x22, 0x7c, 0x3f, 0x2a, 0x2f, 0x5c]); // < > : " | ? * / \

/** Keep only the base name; drop path separators, control chars and unsafe glyphs. */
export function sanitizeFilename(name: string): string {
  const base = (name || "").split("/").pop()?.split(BACKSLASH).pop() ?? "";
  let out = "";
  for (const ch of base) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || c === 127) continue;
    if (FORBIDDEN.has(c)) continue;
    out += ch;
  }
  out = out.replace(/\s+/g, " ").trim();
  if (out.length > 100) out = out.slice(0, 100);
  return out || "file";
}

/** Identify a type from the leading bytes, so extension/MIME can't lie. */
function sniff(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf"; // "%PDF-"
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp"; // "RIFF"…"WEBP"
  return null;
}

export type UploadCheck =
  | { ok: true; name: string; type: string; size: number }
  | { ok: false; error: string };

export async function validateUpload(file: File, rules: UploadRule = RECEIPT_RULES): Promise<UploadCheck> {
  const name = sanitizeFilename(file.name || "file");
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  const maxMb = Math.round(rules.maxBytes / (1024 * 1024));
  if (file.size > rules.maxBytes) return { ok: false, error: `File is too large (max ${maxMb} MB).` };

  const exts = rules.accept[file.type];
  if (!exts) return { ok: false, error: "Unsupported file type. Use JPG, PNG, WEBP or PDF." };

  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!ext || !exts.includes(ext)) return { ok: false, error: "File extension doesn't match its content." };

  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch {
    return { ok: false, error: "Couldn't read that file." };
  }
  const sniffed = sniff(head);
  if (!sniffed || sniffed !== file.type) return { ok: false, error: "File content doesn't match its type." };

  return { ok: true, name, type: file.type, size: file.size };
}

/** Read a validated file to a data URL for in-memory preview/storage. */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}
