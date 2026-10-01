import { q, ah } from "./db";
import { matchContact } from "./sf";

/**
 * On signup: try to link portal user -> sf contact.
 * email+phone exact  => auto link (status active, admins still see it in the list)
 * only one matches  => link pending_review
 * neither           => link row with match_type 'none' (admins can manually link)
 */
export async function linkUserToContact(userId: string, email: string, phone: string | null) {
  const candidates = await matchContact(email, phone);
  const best = candidates[0];
  if (!best || best.score === 0) {
    await q(
      `INSERT INTO ${ah("portal_identity_links")} (user_id, match_type, match_fields, status)
       VALUES ($1,'none','{}','active') ON CONFLICT DO NOTHING`,
      [userId]
    );
    return { matched: false };
  }
  const type = best.score === 2 ? "auto_full" : "auto_partial";
  const status = best.score === 2 ? "active" : "pending_review";
  await q(
    `INSERT INTO ${ah("portal_identity_links")} (user_id, sf_contact_id, match_type, match_fields, status)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [userId, best.contact.Id, type, JSON.stringify(best.fields), status]
  );
  return { matched: true, type, contactId: best.contact.Id, fields: best.fields };
}
