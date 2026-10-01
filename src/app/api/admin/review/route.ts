import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";

const ROLES = ["advisor", "manager", "admin"] as const;

// GET: everything awaiting review — submitted checklist items + uploaded docs
export async function GET() {
  const user = await requireApiUser([...ROLES]);
  if (isResp(user)) return user;
  const [items, docs] = await Promise.all([
    q(`SELECT ci.*, u.email, u.display_name, pa.program_name, pa.term
       FROM ${ah("portal_checklist_items")} ci
       JOIN ${ah("portal_users")} u ON u.id=ci.user_id
       LEFT JOIN ${ah("portal_applications")} pa ON pa.id=ci.application_id
       WHERE ci.status='submitted' ORDER BY ci.updated_at`),
    q(`SELECT d.*, u.email, u.display_name, ci.label AS item_label
       FROM ${ah("portal_documents")} d
       JOIN ${ah("portal_users")} u ON u.id=d.user_id
       LEFT JOIN ${ah("portal_checklist_items")} ci ON ci.id=d.checklist_item_id
       WHERE d.status='uploaded' ORDER BY d.uploaded_at`),
  ]);
  return json({ items: items.rows, documents: docs.rows });
}

// POST {kind:'item'|'doc', id, decision:'approved'|'rejected'|'waived', note}
export async function POST(req: NextRequest) {
  const user = await requireApiUser([...ROLES]);
  if (isResp(user)) return user;
  const { kind, id, decision, note } = await req.json();
  if (!["approved", "rejected", "waived"].includes(decision)) return bad("bad decision");

  if (kind === "item") {
    const { rowCount } = await q(
      `UPDATE ${ah("portal_checklist_items")} SET status=$2, note=$3, reviewed_by=$4, reviewed_at=now(), updated_at=now()
       WHERE id=$1`, [id, decision, note ?? null, user.id]);
    if (!rowCount) return bad("not found", 404);
  } else if (kind === "doc") {
    if (decision === "waived") return bad("docs can't be waived");
    const { rowCount } = await q(
      `UPDATE ${ah("portal_documents")} SET status=$2, note=$3, reviewed_by=$4, reviewed_at=now() WHERE id=$1`,
      [id, decision, note ?? null, user.id]);
    if (!rowCount) return bad("not found", 404);
  } else return bad("bad kind");

  await audit(req, user, "admin_action", { action: `review_${decision}`, kind, id, note });
  return json({ ok: true });
}
