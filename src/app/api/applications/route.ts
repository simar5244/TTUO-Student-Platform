import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";

// Student creates/updates their portal application.
export async function POST(req: NextRequest) {
  const user = await requireApiUser(["student"]);
  if (isResp(user)) return user;
  const { term, term_id, program_id, program_name, degree, student_type, answers, submit } = await req.json();

  const existing = await q<{ id: string; status: string }>(
    `SELECT id, status FROM ${ah("portal_applications")} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [user.id]);
  const cur = existing.rows[0];
  if (cur && cur.status !== "draft") return bad("Application already submitted — contact an advisor to make changes", 409);

  let appId: string;
  if (cur) {
    await q(
      `UPDATE ${ah("portal_applications")} SET term=$2, term_id=$3, program_id=$4, program_name=$5,
         degree=$6, student_type=$7, answers=$8, status=$9, submitted_at=CASE WHEN $9='submitted' THEN now() ELSE submitted_at END, updated_at=now()
       WHERE id=$1`,
      [cur.id, term, term_id, program_id, program_name, degree, student_type, JSON.stringify(answers ?? {}), submit ? "submitted" : "draft"]);
    appId = cur.id;
  } else {
    const { rows } = await q<{ id: string }>(
      `INSERT INTO ${ah("portal_applications")} (user_id, term, term_id, program_id, program_name, degree, student_type, answers, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $9='submitted' THEN now() ELSE NULL END) RETURNING id`,
      [user.id, term, term_id, program_id, program_name, degree, student_type, JSON.stringify(answers ?? {}), submit ? "submitted" : "draft"]);
    appId = rows[0].id;
  }

  if (submit) {
    // materialize checklist from the matching template (program-specific or default)
    const tpl = await q<{ items: { key: string; label: string; required: boolean }[] }>(
      `SELECT items FROM ${ah("portal_checklist_templates")}
       WHERE program_id = $1 OR program_id IS NULL ORDER BY program_id NULLS LAST LIMIT 1`, [program_id ?? null]);
    const items = tpl.rows[0]?.items ?? [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await q(
        `INSERT INTO ${ah("portal_checklist_items")} (application_id, user_id, key, label, required, sort_order, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING`,
        [appId, user.id, it.key, it.label, it.required ?? true, i,
         it.key === "application" ? "approved" : "not_started"]);
    }
    await q(`INSERT INTO ${ah("portal_outbox")} (entity_type, entity_id, action, payload, actor_id)
             VALUES ('application', $1, 'portal_submitted', $2, $3)`,
      [appId, JSON.stringify({ program_name, term, student_type }), user.id]);
  }

  await audit(req, user, "action", { action: submit ? "submit_application" : "save_application", appId, program_id, term });
  return json({ ok: true, id: appId, status: submit ? "submitted" : "draft" });
}
