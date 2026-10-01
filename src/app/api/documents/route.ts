import { NextRequest } from "next/server";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/security";

const MAX = 15 * 1024 * 1024;

// magic-byte signatures — the client-reported MIME is untrusted
const MAGIC: [string, number[]][] = [
  ["application/pdf", [0x25, 0x50, 0x44, 0x46]],                    // %PDF
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],                          // .PNG
  ["image/jpeg", [0xff, 0xd8, 0xff]],                               // JFIF/EXIF
  ["application/msword", [0xd0, 0xcf, 0x11, 0xe0]],                 // OLE2 (.doc)
  ["application/zip", [0x50, 0x4b, 0x03, 0x04]],                    // .docx/.zip container
];
const ALLOWED_EXT = /\.(pdf|png|jpe?g|heic|docx?)$/i;

function sniff(buf: Buffer): string | null {
  for (const [mime, sig] of MAGIC)
    if (sig.every((b, i) => buf[i] === b)) return mime === "application/zip" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : mime;
  // HEIC/HEIF: "ftyp" box with heic/heix brand at offset 4
  if (buf.length > 12 && buf.toString("ascii", 4, 8) === "ftyp" && /^hei[csxmv]$/.test(buf.toString("ascii", 8, 12)))
    return "image/heic";
  return null;
}

export async function GET() {
  const user = await requireApiUser();
  if (isResp(user)) return user;
  const { rows } = await q(
    `SELECT d.id, d.filename, d.mime, d.size, d.status, d.note, d.uploaded_at, d.checklist_item_id,
            ci.label AS item_label
     FROM ${ah("portal_documents")} d LEFT JOIN ${ah("portal_checklist_items")} ci ON ci.id=d.checklist_item_id
     WHERE d.user_id=$1 ORDER BY d.uploaded_at DESC`, [user.id]);
  return json({ documents: rows });
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser(["student"]);
  if (isResp(user)) return user;

  const rl = rateLimit(`upload:${user.id}`, 20, 10 * 60_000); // 20 uploads / 10 min
  if (rl) return rl;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const itemId = (form.get("item") as string) || null;
  if (!file) return bad("No file");
  if (file.size > MAX) return bad("File too large (15MB max)");
  if (!file.name || !ALLOWED_EXT.test(file.name)) return bad("File type not allowed (PDF, JPG, PNG, HEIC, DOCX)");

  const raw = Buffer.from(await file.arrayBuffer());
  const mime = sniff(raw);
  if (!mime) return bad("File contents don't match an allowed type");

  const app = await q<{ id: string }>(`SELECT id FROM ${ah("portal_applications")} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [user.id]);
  const stored = `${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const dir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, stored), encrypt(raw), { mode: 0o600 });

  const { rows } = await q<{ id: string }>(
    `INSERT INTO ${ah("portal_documents")} (user_id, application_id, checklist_item_id, filename, stored_name, mime, size)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [user.id, app.rows[0]?.id ?? null, itemId, file.name.slice(0, 255), stored, mime, file.size]);

  if (itemId) {
    await q(`UPDATE ${ah("portal_checklist_items")} SET status='submitted', updated_at=now()
             WHERE id=$1 AND user_id=$2 AND status NOT IN ('approved','waived')`, [itemId, user.id]);
  }
  await audit(req, user, "action", { action: "upload", file: file.name, size: file.size, itemId });
  return json({ ok: true, id: rows[0].id });
}
