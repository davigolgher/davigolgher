import { describe, it, expect } from "vitest";
import { validateUpload, sanitizeFilename, RECEIPT_RULES } from "./upload";

// jsdom's File.arrayBuffer/slice support is limited; build a File whose bytes we control.
function fileWith(bytes: number[], name: string, type: string): File {
  const arr = new Uint8Array(bytes);
  const f = new File([arr], name, { type });
  // Ensure slice().arrayBuffer() resolves to our bytes regardless of jsdom version.
  (f as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () => arr.buffer;
  (f as unknown as { slice: () => Blob }).slice = () =>
    ({ arrayBuffer: async () => arr.buffer }) as unknown as Blob;
  return f;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

describe("sanitizeFilename", () => {
  it("drops path segments and unsafe chars", () => {
    expect(sanitizeFilename("../../etc/pa*ss?.png")).toBe("pass.png");
    expect(sanitizeFilename("")).toBe("file");
  });
});

describe("validateUpload", () => {
  it("accepts a real PNG", async () => {
    const res = await validateUpload(fileWith(PNG, "receipt.png", "image/png"));
    expect(res.ok).toBe(true);
  });

  it("rejects a fake image (extension/MIME say png, bytes are JPG)", async () => {
    const res = await validateUpload(fileWith(JPG, "evil.png", "image/png"));
    expect(res.ok).toBe(false);
  });

  it("rejects disallowed types", async () => {
    const res = await validateUpload(fileWith(PNG, "a.svg", "image/svg+xml"));
    expect(res.ok).toBe(false);
  });

  it("rejects oversize files", async () => {
    const big = fileWith(PNG, "big.png", "image/png");
    Object.defineProperty(big, "size", { value: RECEIPT_RULES.maxBytes + 1 });
    const res = await validateUpload(big);
    expect(res.ok).toBe(false);
  });
});
