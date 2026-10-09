import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { refreshProjectionForUser } from "@/lib/sync";

// Manager/admin updates an application status/decision or contact stage.
// Writes ONLY to AH.portal_outbox — the superadmin applies it to Salesforce manually.
export async function POST(req: NextRequest) {
  const user = await requireApiUser(["manager", "admin"]);
  if (isResp(user)) return user;
  const { entityType, entityId, action, value, note } = await req.json();
  if (!entityType || !entityId || !action) return bad("entityType, entityId, action required");

  const allowed = ["set_status", "set_stage", "set_decision", "assign_owner", "merge_request", "outreach"];
  if (!allowed.includes(action)) return bad(`action must be one of ${allowed.join(", ")}`);

  const { rows } = await q<{ id: string }>(
    `INSERT INTO ${ah("portal_outbox")} (entity_type, entity_id, action, payload, actor_id, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [entityType, entityId, action, JSON.stringify({ value }), user.id, note ?? null]);

  // if this targets a portal application, reflect locally too (+ timeline event)
  if (entityType === "portal_application" && action === "set_status") {
    const cur = await q<{ status: string; user_id: string }>(
      `SELECT status, user_id FROM ${ah("portal_applications")} WHERE id=$1`, [entityId]);
    if (!cur.rowCount) return bad("portal application not found", 404);
    const prev = cur.rows[0].status;
    await q(`UPDATE ${ah("portal_applications")} SET status=$2, updated_at=now() WHERE id=$1`, [entityId, value]);
    if (prev !== value) {
      await q(
        `INSERT INTO ${ah("portal_application_events")} (application_id, user_id, from_status, to_status, actor_id, actor_kind, note)
         VALUES ($1,$2,$3,$4,$5,'admin',$6)`,
        [entityId, cur.rows[0].user_id, prev, value, user.id, note ?? null]);
      await refreshProjectionForUser(cur.rows[0].user_id).catch(() => {});
    }
  }

  await audit(req, user, "admin_action", { action: `outbox:${action}`, entityType, entityId, value });
  return json({ ok: true, id: rows[0].id });
}
