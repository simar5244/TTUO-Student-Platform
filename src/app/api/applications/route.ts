import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { refreshProjectionForUser, detectApplicationNow } from "@/lib/sync";

// RaiderConnect is the apply surface. The portal records the student's intent
// (program/term/modality), hands them off to texastech.my.site.com, then
// detects the SF application when it lands — poll or "check now".
const RC_URL = "https://texastech.my.site.com/online/TX_SiteLogin?startURL=%2Fonline%2FTargetX_App__NewApplication";

export async function POST(req: NextRequest) {
  const user = await requireApiUser(["student"]);
  if (isResp(user)) return user;
  const body = await req.json();

  // -- record what they intend to apply for; send them to RaiderConnect ------
  if (body.action === "intent") {
    const { program_label, modality, term, term_id } = body;
    if (!program_label) return bad("pick a program");
    const cur = (await q<{ id: string; status: string }>(
      `SELECT id, status FROM ${ah("portal_applications")} WHERE user_id=$1
       ORDER BY created_at DESC LIMIT 1`, [user.id])).rows[0];
    if (cur && !["draft", "rc_started"].includes(cur.status))
      return bad("Application already submitted — tracking it on your checklist", 409);

    let appId: string;
    if (cur) {
      appId = cur.id;
      await q(
        `UPDATE ${ah("portal_applications")} SET rc_program=$2, modality=$3, term=$4, term_id=$5,
           program_name=$2, status='rc_started', rc_opened_at=now(), updated_at=now() WHERE id=$1`,
        [appId, program_label, modality ?? null, term ?? null, term_id ?? null]);
    } else {
      appId = (await q<{ id: string }>(
        `INSERT INTO ${ah("portal_applications")}
           (user_id, rc_program, program_name, modality, term, term_id, status, rc_opened_at)
         VALUES ($1,$2,$2,$3,$4,$5,'rc_started',now()) RETURNING id`,
        [user.id, program_label, modality ?? null, term ?? null, term_id ?? null])).rows[0].id;
    }
    await q(
      `INSERT INTO ${ah("portal_application_events")} (application_id, user_id, from_status, to_status, actor_id, actor_kind, note)
       VALUES ($1,$2,$3,'rc_started',$4,'student',$5)`,
      [appId, user.id, cur?.status ?? null, user.id, `RaiderConnect: ${program_label} · ${term ?? ""}`]);
    await refreshProjectionForUser(user.id).catch(() => {});
    await audit(req, user, "action", { action: "rc_intent", appId, program_label, term });
    return json({ ok: true, id: appId, rcUrl: RC_URL });
  }

  // -- "I've submitted — check now": look for their SF app, live --------------
  if (body.action === "detect") {
    const link = (await q<{ sf_contact_id: string | null }>(
      `SELECT sf_contact_id FROM ${ah("portal_identity_links")}
       WHERE user_id=$1 AND status IN ('active','confirmed') AND sf_contact_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`, [user.id])).rows[0];
    if (!link?.sf_contact_id)
      return json({ detected: false, reason: "not_linked" });

    // the clone first (already local), then the warehouse live table —
    // a manual check shouldn't wait for the next clone run.
    let sfApp: string | null = (await q<{ id: string }>(
      `SELECT id FROM ${ah("sf_application")} WHERE contact_id=$1
       ORDER BY sf_created DESC NULLS LAST LIMIT 1`, [link.sf_contact_id])).rows[0]?.id ?? null;
    if (!sfApp) sfApp = (await detectApplicationNow(link.sf_contact_id).catch(() => null)) ?? null;
    if (!sfApp) return json({ detected: false, reason: "none_yet" });

    const upd = await q<{ id: string }>(
      `UPDATE ${ah("portal_applications")}
       SET sf_application_id=$2, sf_detected_at=now(), status='submitted', updated_at=now()
       WHERE user_id=$1 AND sf_application_id IS NULL AND status IN ('draft','rc_started')
       RETURNING id`,
      [user.id, sfApp]);
    if (upd.rows[0]) {
      await q(
        `INSERT INTO ${ah("portal_application_events")} (application_id, user_id, to_status, actor_id, actor_kind, note)
         VALUES ($1,$2,'submitted',$2,'student','Salesforce application detected (manual check)')`,
        [upd.rows[0].id, user.id]);
      await refreshProjectionForUser(user.id).catch(() => {});
    }
    await audit(req, user, "action", { action: "rc_detect", found: true });
    return json({ detected: true, sfApplicationId: sfApp, attached: !!upd.rows[0] });
  }

  return bad("unknown action");
}
