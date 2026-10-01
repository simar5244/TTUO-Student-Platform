import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { matchContact, findContactById } from "@/lib/sf";
import { normalizePhone } from "@/lib/auth";

const ROLE = ["manager", "admin"] as const;

// GET: pending review links + unlinked portal users (+ their suggested matches)
export async function GET() {
  const user = await requireApiUser([...ROLE]);
  if (isResp(user)) return user;

  const pending = await q(
    `SELECT l.*, u.email, u.phone, u.display_name, u.created_at AS user_created
     FROM ${ah("portal_identity_links")} l JOIN ${ah("portal_users")} u ON u.id=l.user_id
     WHERE l.status='pending_review' AND u.role='student' ORDER BY l.created_at DESC`);
  const unlinked = await q<{ link_id: string; user_id: string; email: string; phone: string | null; display_name: string; created_at: string }>(
    `SELECT l.id AS link_id, u.id AS user_id, u.email, u.phone, u.display_name, u.created_at
     FROM ${ah("portal_users")} u JOIN ${ah("portal_identity_links")} l ON l.user_id=u.id
     WHERE u.role='student' AND l.match_type='none' AND l.status='active' ORDER BY u.created_at DESC LIMIT 100`);

  // enrich pending with contact snapshot
  const pendingEnriched = await Promise.all(pending.rows.map(async (r) => ({
    ...r, contact: r.sf_contact_id ? await findContactById(r.sf_contact_id) : null,
  })));

  // suggestions for unlinked (top-3 candidates each)
  const unlinkedEnriched = await Promise.all(unlinked.rows.map(async (r) => ({
    ...r, candidates: (await matchContact(r.email, r.phone)).slice(0, 3).map((c) => ({ ...c.contact, fields: c.fields, score: c.score })),
  })));

  const auto = await q(
    `SELECT l.*, u.email, u.display_name FROM ${ah("portal_identity_links")} l
     JOIN ${ah("portal_users")} u ON u.id=l.user_id
     WHERE l.match_type='auto_full' AND l.status='active' ORDER BY l.created_at DESC LIMIT 50`);
  const autoEnriched = await Promise.all(auto.rows.map(async (r) => ({
    ...r, contact: r.sf_contact_id ? await findContactById(r.sf_contact_id) : null,
  })));

  return json({ pending: pendingEnriched, unlinked: unlinkedEnriched, autoLinked: autoEnriched });
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
    if (st === "confirmed" && link?.sf_contact_id) {
      await q(`INSERT INTO ${ah("portal_outbox")} (entity_type, entity_id, action, payload, actor_id)
               VALUES ('link', $1, 'verify_portal_link', $2, $3)`,
        [link.sf_contact_id, JSON.stringify({ portal_user: link.user_id }), user.id]);
    }
    await audit(req, user, "admin_action", { action: `link_${st}`, link: body.linkId });
    return json({ ok: true });
  }

  if (body.action === "link") {
    const { userId, contactId } = body;
    if (!userId || !contactId) return bad("userId and contactId required");
    const contact = await findContactById(contactId);
    if (!contact) return bad("contact not found", 404);
    await q(`DELETE FROM ${ah("portal_identity_links")} WHERE user_id=$1`, [userId]);
    await q(
      `INSERT INTO ${ah("portal_identity_links")} (user_id, sf_contact_id, match_type, match_fields, status, reviewed_by, reviewed_at, note)
       VALUES ($1,$2,'manual',$3,'confirmed',$4,now(),$5)`,
      [userId, contactId, JSON.stringify(body.fields ?? {}), user.id, body.note ?? "manual link"]);
    await q(`INSERT INTO ${ah("portal_outbox")} (entity_type, entity_id, action, payload, actor_id)
             VALUES ('link', $1, 'manual_merge_review', $2, $3)`,
      [contactId, JSON.stringify({ portal_user: userId, note: "Admin-linked portal account to SF contact — merge records in Salesforce if duplicate" }), user.id]);
    await audit(req, user, "admin_action", { action: "manual_link", userId, contactId });
    return json({ ok: true });
  }

  if (body.action === "unlink") {
    await q(`UPDATE ${ah("portal_identity_links")} SET status='rejected', reviewed_by=$2, reviewed_at=now() WHERE id=$1`, [body.linkId, user.id]);
    return json({ ok: true });
  }

  return bad("unknown action");
}
