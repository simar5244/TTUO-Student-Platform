import { NextRequest } from "next/server";
import path from "path";
import fs from "fs/promises";
import { requireApiUser, isResp, bad } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (isResp(user)) return user;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad("not found", 404);

  const { rows } = await q<{ stored_name: string; filename: string; mime: string; user_id: string }>(
    `SELECT stored_name, filename, mime, user_id FROM ${ah("portal_documents")} WHERE id=$1`, [id]);
  const doc = rows[0];
  if (!doc) return bad("not found", 404);
  const staff = ["advisor", "manager", "admin"].includes(user.role);
  if (!staff && doc.user_id !== user.id) return bad("forbidden", 403);

  // stored_name is a UUID we generated — reject anything pathy anyway
  if (/[/\\]|\.\./.test(doc.stored_name)) return bad("not found", 404);
  const dir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  const filePath = path.resolve(dir, doc.stored_name);
  if (!filePath.startsWith(dir + path.sep)) return bad("not found", 404);

  const file = decrypt(await fs.readFile(filePath));
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": doc.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
