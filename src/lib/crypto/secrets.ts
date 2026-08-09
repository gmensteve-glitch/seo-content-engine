// AES-256-GCM encryption for connector secrets (Shopify tokens, GSC refresh
// tokens, etc.). Config blobs are encrypted at rest in Connector.configEnc and
// only decrypted in memory when a connector runs. Never log decrypted values.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY is not set");
  }
  // Accept a base64 (preferred) or hex 32-byte key.
  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return buf;
}

/** Encrypt an object → a compact string safe to store in the DB. */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: v1.<iv>.<tag>.<ciphertext>  (all base64url)
  return ["v1", b64(iv), b64(tag), b64(enc)].join(".");
}

/** Decrypt a stored string back into its object. */
export function decryptJson<T = unknown>(blob: string): T {
  const [version, ivB64, tagB64, dataB64] = blob.split(".");
  if (version !== "v1") throw new Error("Unknown secret format");
  const decipher = createDecipheriv(ALGO, key(), unb64(ivB64));
  decipher.setAuthTag(unb64(tagB64));
  const dec = Buffer.concat([
    decipher.update(unb64(dataB64)),
    decipher.final(),
  ]);
  return JSON.parse(dec.toString("utf8")) as T;
}

/** Generate a fresh 32-byte key (base64) — run once, put in env. */
export function generateKey(): string {
  return randomBytes(32).toString("base64");
}

function b64(b: Buffer): string {
  return b.toString("base64url");
}
function unb64(s: string): Buffer {
  return Buffer.from(s, "base64url");
}
