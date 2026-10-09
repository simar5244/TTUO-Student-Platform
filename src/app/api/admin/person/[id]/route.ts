import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { findContactById, contactApplications, checklistForApplication } from "@/lib/sf";
import { q, ah, sf, whPool } from "@/lib/db";

// 360 view for one SF contact: record + applications + portal link + docs + notes + interactions
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["advisor", "manager", "admin"]);
  if (isResp(user)) return user;
  const { id } = await params;

  const [contact, apps, link, notes, interactions, proj] = await Promise.all([
    findContactById(id),
    contactApplications(id),
    q(`SELECT l.*, u.email AS portal_email, u.display_name AS portal_name, u.id AS portal_user_id
       FROM ${ah("portal_identity_links")} l JOIN ${ah("portal_users")} u ON u.id=l.user_id
       WHERE l.sf_contact_id=$1 ORDER BY l.created_at DESC`, [id]),
    q(`SELECT n.*, u.display_name AS author FROM ${ah("portal_notes")} n JOIN ${ah("portal_users")} u ON u.id=n.author_id
       WHERE n.sf_contact_id=$1 ORDER BY n.created_at DESC LIMIT 50`, [id]),
    q(`SELECT "Id", "Name", "Interaction_Date__c" AS date FROM ${sf("interaction")} WHERE "Contact__c"=$1 ORDER BY "Interaction_Date__c" DESC NULLS LAST LIMIT 25`, [id], whPool()),
    // generated portal columns stitched onto this SF contact (rebuilt each sync)
    q(`SELECT * FROM ${ah("portal_contact_projection")} WHERE sf_contact_id=$1`, [id]),
  ]);
  if (!contact) return bad("contact not found", 404);

  const portalUserId = link.rows[0]?.portal_user_id;
  const [docs, checklist, portalApp, activity] = portalUserId
    ? await Promise.all([
        q(`SELECT id, filename, status, uploaded_at, mime, size FROM ${ah("portal_documents")} WHERE user_id=$1 ORDER BY uploaded_at DESC`, [portalUserId]),
        q(`SELECT * FROM ${ah("portal_checklist_items")} WHERE user_id=$1 ORDER BY sort_order`, [portalUserId]),
        q(`SELECT * FROM ${ah("portal_applications")} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [portalUserId]),
        q(`SELECT kind, path, created_at, duration_ms FROM ${ah("portal_activity")} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`, [portalUserId]),
      ])
    : [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }];

  // stateful status timeline for their portal application
  const appId = portalApp.rows[0]?.id;
  const events = appId
    ? await q(
        `SELECT e.*, u.display_name AS actor_name, u.email AS actor_email
         FROM ${ah("portal_application_events")} e LEFT JOIN ${ah("portal_users")} u ON u.id=e.actor_id
         WHERE e.application_id=$1 ORDER BY e.created_at`, [appId])
    : { rows: [] };

  // per-item SF checklist on their newest application (the RaiderConnect truth)
  const sfChecklist = apps[0]?.Id ? await checklistForApplication(apps[0].Id) : [];

  return json({
    contact, applications: apps, links: link.rows, notes: notes.rows,
    interactions: interactions.rows, documents: docs.rows,
    checklist: checklist.rows, sfChecklist,
    portalApplication: portalApp.rows[0] ?? null,
    recentActivity: activity.rows, projection: proj.rows[0] ?? null,
    appEvents: events.rows,
  });
}

// Add an advisor note on a contact
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["advisor", "manager", "admin"]);
  if (isResp(user)) return user;
  const { id } = await params;
  const { body } = await req.json();
  if (!body?.trim()) return bad("empty note");
  await q(`INSERT INTO ${ah("portal_notes")} (sf_contact_id, author_id, body) VALUES ($1,$2,$3)`, [id, user.id, body.trim()]);
  await audit(req, user, "admin_action", { action: "note", contact: id });
  return json({ ok: true });
}
