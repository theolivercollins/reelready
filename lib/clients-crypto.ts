// Encrypt and decrypt sensitive client config (Sierra admin passwords).
// AES-256-GCM with a single key from CLIENTS_ENCRYPTION_KEY env var.
// Format on disk: base64( nonce[12] || authTag[16] || ciphertext )

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.CLIENTS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CLIENTS_ENCRYPTION_KEY is not set — required to encrypt client credentials."
    );
  }
  // Accept either a 64-char hex string (32 bytes) or any string we hash to 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([nonce, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");
  const nonce = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
