// AES-256-GCM encryption for uploaded documents at rest.
// Key comes from DOC_ENC_KEY (32-byte hex or any string -> sha256 derived).
// Encrypted files are prefixed with magic bytes AHENC1 so we can tell them apart.
import crypto from "crypto";

const MAGIC = Buffer.from("AHENC1");

const key = () => {
  const k = process.env.DOC_ENC_KEY;
  if (!k) return null;
  return /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, "hex") : crypto.createHash("sha256").update(k).digest();
};

export const encEnabled = () => !!key();

export function encrypt(buf: Buffer): Buffer {
  const k = key();
  if (!k) return buf; // dev mode: plaintext (DOC_ENC_KEY unset)
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  return Buffer.concat([MAGIC, iv, cipher.update(buf), cipher.final(), cipher.getAuthTag()]);
}

export function decrypt(buf: Buffer): Buffer {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) return buf; // not encrypted (legacy file)
  const k = key();
  if (!k) throw new Error("DOC_ENC_KEY required to decrypt stored documents");
  const iv = buf.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(MAGIC.length + 12, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
