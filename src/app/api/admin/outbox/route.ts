import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";

// SF outbox: changes a superadmin must apply to Salesforce by hand
export async function GET(req: NextRequest) {
  const user = await requireApiUser(["admin"]);
  if (isResp(user)) return user;
  const status = req.nextUrl.searchParams.get("status") || "pending";
  const { rows } = await q(
    `SELECT o.*, a.display_name AS actor, d.display_name AS done_by_name,
            su.display_name AS student_name, su.email AS student_email,
            c.name AS contact_name, c.email AS contact_email,
            pd.filename AS doc_filename, pu2.display_name AS doc_owner_name, pu2.email AS doc_owner_email
     FROM ${ah("portal_outbox")} o
     LEFT JOIN ${ah("portal_users")} a ON a.id=o.actor_id
     LEFT JOIN ${ah("portal_users")} d ON d.id=o.done_by
     LEFT JOIN ${ah("portal_users")} su ON su.id::text = COALESCE(o.payload->>'portal_user', o.payload->>'user_id')
     LEFT JOIN ${ah("sf_contact")} c ON c.id = o.entity_id
     LEFT JOIN ${ah("portal_documents")} pd ON pd.id::text = o.entity_id
     LEFT JOIN ${ah("portal_users")} pu2 ON pu2.id = pd.user_id
     ${status === "all" ? "" : "WHERE o.status=$1"} ORDER BY o.created_at DESC LIMIT 200`,
    status === "all" ? [] : [status]);
  return json({ items: rows });
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser(["admin"]);
  if (isResp(user)) return user;
  const { id, done, note } = await req.json();
  if (!id) return bad("id required");
  await q(`UPDATE ${ah("portal_outbox")} SET status=$2, done_by=$3, done_at=now(), note=COALESCE($4,note) WHERE id=$1`,
    [id, done ? "done" : "skipped", user.id, note ?? null]);
  await audit(req, user, "admin_action", { action: done ? "outbox_done" : "outbox_skip", id });
  return json({ ok: true });
}
