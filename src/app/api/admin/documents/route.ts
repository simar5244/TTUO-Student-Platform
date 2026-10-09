import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { checklistForApplication } from "@/lib/sf";

const ROLE = ["advisor", "manager", "admin"] as const;

// The document bridge: students upload here; staff pull the file, attach it in
// RaiderConnect/Salesforce by hand, then mark it 'pushed'. The next sync flips
// it to 'approved' automatically once SF shows the checklist item received.
export async function GET() {
  const user = await requireApiUser([...ROLE]);
  if (isResp(user)) return user;

  const { rows } = await q(
    `SELECT d.id, d.filename, d.mime, d.size, d.status, d.note, d.uploaded_at,
            d.req_key, d.sf_item_id, d.sf_application_id, d.sf_confirmed_at,
            u.email, u.display_name, u.id AS user_id,
            l.sf_contact_id, i.name AS item_name
     FROM ${ah("portal_documents")} d
     JOIN ${ah("portal_users")} u ON u.id = d.user_id
     LEFT JOIN ${ah("portal_identity_links")} l
            ON l.user_id = u.id AND l.status IN ('active','confirmed')
     LEFT JOIN ${ah("sf_checklist_item")} i ON i.id = d.sf_item_id
     WHERE d.status IN ('pending_review','pushed')
     ORDER BY d.status='pending_review' DESC, d.uploaded_at ASC`);

  // candidate SF checklist items per student (their latest app's open items)
  const enriched = await Promise.all(rows.map(async (r) => {
    let candidates: { id: string; name: string | null; status: string | null; req_code: string | null }[] = [];
    const appId = r.sf_application_id ??
      (r.sf_contact_id
        ? (await q<{ id: string }>(
            `SELECT id FROM ${ah("sf_application")} WHERE contact_id=$1
             ORDER BY sf_created DESC NULLS LAST LIMIT 1`, [r.sf_contact_id])).rows[0]?.id
        : null);
    if (appId) {
      candidates = (await checklistForApplication(appId))
        .filter((i) => !i.done)
        .map((i) => ({ id: i.id, name: i.name, status: i.status, req_code: i.req_code }));
    }
    return { ...r, sf_app_id: appId ?? null, candidates };
  }));

  return json({ documents: enriched });
}

// POST:
//   {action:'push',    id, sf_item_id?}  — file is in SF now; parity confirms it
//   {action:'reject',  id, note}         — wrong doc / unreadable / etc
//   {action:'requeue', id}               — pushed by mistake, back to review
export async function POST(req: NextRequest) {
  const user = await requireApiUser([...ROLE]);
  if (isResp(user)) return user;
  const body = await req.json();
  const { action, id } = body;
  if (!id) return bad("id required");

  const doc = (await q<{ user_id: string; filename: string; sf_item_id: string | null }>(
    `SELECT user_id, filename, sf_item_id FROM ${ah("portal_documents")} WHERE id=$1`, [id])).rows[0];
  if (!doc) return bad("not found", 404);

  if (action === "push") {
    const sfItem = body.sf_item_id ?? doc.sf_item_id ?? null;
    await q(
      `UPDATE ${ah("portal_documents")}
       SET status='pushed', sf_item_id=$3, reviewed_by=$2, reviewed_at=now(), note=$4
       WHERE id=$1`,
      [id, user.id, sfItem, body.note ?? null]);
    await q(
      `INSERT INTO ${ah("portal_outbox")} (entity_type, entity_id, action, payload, actor_id)
       VALUES ('document', $1, 'sf_upload_done', $2, $3)`,
      [id, JSON.stringify({ filename: doc.filename, sf_item_id: sfItem, user_id: doc.user_id }), user.id]);
  } else if (action === "reject") {
    await q(
      `UPDATE ${ah("portal_documents")} SET status='rejected', reviewed_by=$2, reviewed_at=now(), note=$3
       WHERE id=$1`, [id, user.id, body.note ?? "Rejected"]);
  } else if (action === "requeue") {
    await q(
      `UPDATE ${ah("portal_documents")} SET status='pending_review', reviewed_by=NULL, reviewed_at=NULL
       WHERE id=$1 AND status='pushed'`, [id]);
  } else {
    return bad("unknown action");
  }
  await audit(req, user, "admin_action", { action: `doc_${action}`, doc: id });
  return json({ ok: true });
}
