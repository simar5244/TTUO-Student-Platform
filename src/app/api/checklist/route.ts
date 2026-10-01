import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";

export async function GET() {
  const user = await requireApiUser();
  if (isResp(user)) return user;
  const { rows } = await q(
    `SELECT ci.*, (SELECT count(*)::int FROM ${ah("portal_documents")} d WHERE d.checklist_item_id = ci.id) AS docs
     FROM ${ah("portal_checklist_items")} ci WHERE ci.user_id=$1 ORDER BY ci.sort_order`, [user.id]);
  return json({ items: rows });
}

// Student marks an item in_progress / submitted (document-linked items flip to submitted on upload)
export async function POST(req: NextRequest) {
  const user = await requireApiUser(["student"]);
  if (isResp(user)) return user;
  const { id, status } = await req.json();
  if (!["in_progress", "submitted", "not_started"].includes(status)) return bad("bad status");
  const { rowCount } = await q(
    `UPDATE ${ah("portal_checklist_items")} SET status=$3, updated_at=now()
     WHERE id=$1 AND user_id=$2 AND status NOT IN ('approved','waived')`,
    [id, user.id, status]);
  if (!rowCount) return bad("Item not found or locked", 404);
  await audit(req, user, "action", { action: "checklist_update", item: id, status });
  return json({ ok: true });
}
