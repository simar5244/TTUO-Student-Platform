import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah, whPool } from "@/lib/db";
import { scoreCandidates, scoreFields, splitName, findContactById, searchWarehouseContacts, ensureCloned, contactApplications, checklistForApplication } from "@/lib/sf";
import { refreshProjectionForContact } from "@/lib/sync";

const ROLE = ["manager", "admin"] as const;

const userSignals = (r: { email: string; phone: string | null; display_name: string | null }) => {
  const { first, last } = splitName(r.display_name);
  return { email: r.email, phone: r.phone, first, last };
};

// GET: pending review links + flagged auto-links + unlinked portal users
//      (+ scored candidates). ?browse=<term> searches the ENTIRE warehouse
//      contact table — for students whose lead predates the online slice.
export async function GET(req: NextRequest) {
  const user = await requireApiUser([...ROLE]);
  if (isResp(user)) return user;

  const browse = req.nextUrl.searchParams.get("browse");
  if (browse && browse.trim().length >= 3) {
    const rows = await searchWarehouseContacts(browse.trim());
    return json({ browse: rows });
  }

  // ?preview=<sfContactId> — full detail for the link modal: contact, their SF
  // applications, and checklist progress. Reads the clone; if the contact isn't
  // in the slice yet, falls back to a live warehouse row.
  const preview = req.nextUrl.searchParams.get("preview");
  if (preview) {
    let contact = await findContactById(preview);
    if (!contact) {
      // outside the clone slice — read the raw warehouse row for the preview
      const { rows } = await whPool().query(
        `SELECT c."Id" AS "Id", c."Name" AS "Name", c."FirstName" AS "FirstName",
                c."LastName" AS "LastName", c."Email" AS "Email",
                c."MobilePhone" AS "MobilePhone", c."Phone" AS "Phone",
                c."TargetX_SRMb__Status__c" AS status, rt."Name" AS record_type,
                c."TargetX_SRMb__Anticipated_Start_Term__c" AS term,
                c."LeadSource" AS lead_source, c."MailingCity" AS city,
                c."MailingState" AS state, c."CreatedDate" AS created
         FROM ${process.env.SF_SCHEMA || "sf_origin"}.contact c
         LEFT JOIN ${process.env.SF_SCHEMA || "sf_origin"}.recordtype rt ON rt."Id" = c."RecordTypeId"
         WHERE c."Id" = $1`, [preview]);
      contact = rows[0] ?? null;
    }
    if (!contact) return bad("contact not found", 404);
    const applications = await contactApplications(preview).catch(() => []);
    const latest = applications[0];
    const checklist = latest ? await checklistForApplication(latest.id).catch(() => []) : [];
    return json({
      contact,
      applications,
      checklist_done: checklist.filter((i) => i.done).length,
      checklist_total: checklist.filter((i) => !i.not_required).length,
      checklist_items: checklist,
    });
  }

  const pending = await q<{
    id: string; user_id: string; sf_contact_id: string | null; match_type: string;
    match_fields: Record<string, boolean>; confidence: number; status: string;
    created_at: string; email: string; phone: string | null; display_name: string | null;
    user_created: string;
  }>(
    `SELECT l.*, u.email, u.phone, u.display_name, u.created_at AS user_created
     FROM ${ah("portal_identity_links")} l JOIN ${ah("portal_users")} u ON u.id=l.user_id
     WHERE l.status='pending_review' AND u.role='student' ORDER BY l.confidence DESC, l.created_at DESC`);
  const unlinked = await q<{ link_id: string; user_id: string; email: string; phone: string | null; display_name: string; created_at: string }>(
    `SELECT l.id AS link_id, u.id AS user_id, u.email, u.phone, u.display_name, u.created_at
     FROM ${ah("portal_users")} u JOIN ${ah("portal_identity_links")} l ON l.user_id=u.id
     WHERE u.role='student' AND l.match_type='none' AND l.status='active' ORDER BY u.created_at DESC LIMIT 100`);

  // enrich pending with the contact + a freshly recomputed field-level score
  const pendingEnriched = await Promise.all(pending.rows.map(async (r) => {
    const contact = r.sf_contact_id ? await findContactById(r.sf_contact_id) : null;
    const scored = contact ? scoreFields(userSignals(r), contact) : null;
    return { ...r, contact, live_fields: scored?.fields ?? null, live_confidence: scored?.confidence ?? r.confidence };
  }));

  // suggestions for unlinked (all scored candidates each, with per-field
  // evidence — the page groups them by which fields matched)
  const unlinkedEnriched = await Promise.all(unlinked.rows.map(async (r) => ({
    ...r,
    candidates: (await scoreCandidates(userSignals(r))).slice(0, 12)
      .map((c) => ({ ...c.contact, fields: c.fields, confidence: c.confidence })),
  })));

  // auto-linked on email+phone but the name didn't match — needs an eyeball
  const flagged = await q<typeof pending.rows[number]>(
    `SELECT l.*, u.email, u.phone, u.display_name, u.created_at AS user_created
     FROM ${ah("portal_identity_links")} l JOIN ${ah("portal_users")} u ON u.id=l.user_id
     WHERE l.status='active' AND l.flagged AND u.role='student' ORDER BY l.created_at DESC`);
  const flaggedEnriched = await Promise.all(flagged.rows.map(async (r) => {
    const contact = r.sf_contact_id ? await findContactById(r.sf_contact_id) : null;
    const scored = contact ? scoreFields(userSignals(r), contact) : null;
    return { ...r, contact, live_fields: scored?.fields ?? null };
  }));

  // everyone currently linked — auto (full/pair once verified), manual —
  // so confirmed links stay visible instead of vanishing from the page
  const auto = await q(
    `SELECT l.*, u.email, u.display_name FROM ${ah("portal_identity_links")} l
     JOIN ${ah("portal_users")} u ON u.id=l.user_id
     WHERE l.match_type IN ('auto_full','auto_pair','manual') AND l.status IN ('active','confirmed')
       AND NOT l.flagged
     ORDER BY l.reviewed_at DESC NULLS LAST, l.created_at DESC LIMIT 50`);
  const autoEnriched = await Promise.all(auto.rows.map(async (r) => ({
    ...r, contact: r.sf_contact_id ? await findContactById(r.sf_contact_id) : null,
  })));

  return json({ pending: pendingEnriched, flagged: flaggedEnriched, unlinked: unlinkedEnriched, autoLinked: autoEnriched });
}

// POST actions:
//  {action:'confirm'|'reject', linkId}
//  {action:'link', userId, contactId}       — manual link
//  {action:'unlink', linkId}
export async function POST(req: NextRequest) {
  const user = await requireApiUser([...ROLE]);
  if (isResp(user)) return user;
  const body = await req.json();

  if (body.action === "confirm" || body.action === "reject") {
    const st = body.action === "confirm" ? "confirmed" : "rejected";
    await q(`UPDATE ${ah("portal_identity_links")} SET status=$2, reviewed_by=$3, reviewed_at=now(), note=$4 WHERE id=$1`,
      [body.linkId, st, user.id, body.note ?? null]);
    const link = (await q(`SELECT sf_contact_id, user_id FROM ${ah("portal_identity_links")} WHERE id=$1`, [body.linkId])).rows[0];
    if (st === "rejected" && link?.user_id) {
      // rejected candidate drops the user back into the unlinked lane
      await q(`INSERT INTO ${ah("portal_identity_links")} (user_id, match_type, match_fields, status, confidence)
               VALUES ($1,'none','{}','active',0)`, [link.user_id]);
    }
    if (link?.sf_contact_id) await refreshProjectionForContact(link.sf_contact_id).catch(() => {});
    if (st === "confirmed" && link?.sf_contact_id) {
      await q(`INSERT INTO ${ah("portal_outbox")} (entity_type, entity_id, action, payload, actor_id)
               VALUES ('link', $1, 'verify_portal_link', $2, $3)`,
        [link.sf_contact_id, JSON.stringify({ portal_user: link.user_id }), user.id]);
    }
    await audit(req, user, "admin_action", { action: `link_${st}`, link: body.linkId });
    return json({ ok: true });
  }

  if (body.action === "unflag") {
    const { rows } = await q<{ sf_contact_id: string | null }>(
      `UPDATE ${ah("portal_identity_links")}
       SET status='confirmed', flagged=FALSE, reviewed_by=$2, reviewed_at=now(), note=$3
       WHERE id=$1 AND status='active' AND flagged
       RETURNING sf_contact_id`, [body.linkId, user.id, body.note ?? "auto-pair verified"]);
    if (!rows[0]) return bad("not a flagged link", 404);
    await q(`INSERT INTO ${ah("portal_outbox")} (entity_type, entity_id, action, payload, actor_id)
             VALUES ('link', $1, 'verify_portal_link', $2, $3)`,
      [rows[0].sf_contact_id, JSON.stringify({ note: "auto-pair link verified by admin" }), user.id]);
    if (rows[0].sf_contact_id) await refreshProjectionForContact(rows[0].sf_contact_id).catch(() => {});
    await audit(req, user, "admin_action", { action: "match_unflag", link: body.linkId });
    return json({ ok: true });
  }

  if (body.action === "link") {
    const { userId, contactId } = body;
    if (!userId || !contactId) return bad("userId and contactId required");
    let contact = await findContactById(contactId);
    if (!contact) {
      // browsed straight from the warehouse — outside the clone slice; fetch it in
      await ensureCloned(contactId);
      contact = await findContactById(contactId);
    }
    if (!contact) return bad("contact not found", 404);
    const pu = (await q<{ email: string; phone: string | null; display_name: string | null }>(
      `SELECT email, phone, display_name FROM ${ah("portal_users")} WHERE id=$1`, [userId])).rows[0];
    const scored = pu ? scoreFields(userSignals(pu), contact) : { fields: {}, confidence: 0 };
    await q(`DELETE FROM ${ah("portal_identity_links")} WHERE user_id=$1`, [userId]);
    await q(
      `INSERT INTO ${ah("portal_identity_links")} (user_id, sf_contact_id, match_type, match_fields, status, confidence, reviewed_by, reviewed_at, note)
       VALUES ($1,$2,'manual',$3,'confirmed',$4,$5,now(),$6)`,
      [userId, contactId, JSON.stringify(scored.fields), scored.confidence, user.id, body.note ?? "manual link"]);
    await refreshProjectionForContact(contactId).catch(() => {});
    await q(`INSERT INTO ${ah("portal_outbox")} (entity_type, entity_id, action, payload, actor_id)
             VALUES ('link', $1, 'manual_merge_review', $2, $3)`,
      [contactId, JSON.stringify({ portal_user: userId, confidence: scored.confidence, note: "Admin-linked portal account to SF contact — merge records in Salesforce if duplicate" }), user.id]);
    await audit(req, user, "admin_action", { action: "manual_link", userId, contactId });
    return json({ ok: true });
  }

  if (body.action === "unlink") {
    const link = (await q(`SELECT sf_contact_id, user_id FROM ${ah("portal_identity_links")} WHERE id=$1`, [body.linkId])).rows[0];
    await q(`UPDATE ${ah("portal_identity_links")} SET status='rejected', reviewed_by=$2, reviewed_at=now() WHERE id=$1`, [body.linkId, user.id]);
    if (link?.user_id) {
      await q(`INSERT INTO ${ah("portal_identity_links")} (user_id, match_type, match_fields, status, confidence)
               VALUES ($1,'none','{}','active',0)`, [link.user_id]);
    }
    if (link?.sf_contact_id) await refreshProjectionForContact(link.sf_contact_id).catch(() => {});
    return json({ ok: true });
  }

  return bad("unknown action");
}
