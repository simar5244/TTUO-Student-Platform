import { q, ah } from "./db";
import { scoreCandidates, splitName } from "./sf";

/**
 * On signup: try to link portal user -> cloned SF contact.
 *
 *   email + phone + name hit     => auto link (active)
 *   email + phone (no name hit)  => auto link, flagged for a human glance
 *   exactly one field hits       => link pending_review — admin picks from the
 *                                   scored candidates in the match queue
 *   no hits at all               => unlinked; admins can still browse/search
 *                                   every cloned contact from the queue
 *
 * Nothing ever writes back to Salesforce — confirmations live in
 * portal_identity_links and generate portal_outbox items for the superadmin.
 */
export async function linkUserToContact(
  userId: string, email: string, phone: string | null, name?: string | null
) {
  const { first, last } = splitName(name);
  const candidates = await scoreCandidates({ email, phone, first, last });
  const best = candidates[0];
  if (!best) {
    await q(
      `INSERT INTO ${ah("portal_identity_links")} (user_id, match_type, match_fields, status, confidence)
       VALUES ($1,'none','{}','active',0) ON CONFLICT DO NOTHING`,
      [userId]
    );
    return { matched: false };
  }

  const { email: em, phone: ph, first_name: fn, last_name: ln } = best.fields;
  const nameHit = fn || ln;
  const core = [em, ph, nameHit].filter(Boolean).length;

  if (core === 3) {
    // strongest signal — all three fields line up
    await q(
      `INSERT INTO ${ah("portal_identity_links")}
         (user_id, sf_contact_id, match_type, match_fields, status, confidence)
       VALUES ($1,$2,'auto_full',$3,'active',$4) ON CONFLICT DO NOTHING`,
      [userId, best.contact.Id, JSON.stringify(best.fields), best.confidence]
    );
    return { matched: true, type: "auto_full", contactId: best.contact.Id, fields: best.fields, confidence: best.confidence };
  }

  if (em && ph) {
    // email+phone is still very strong, but the name didn't hit — auto-link
    // and flag it so a human eyeballs it in the queue.
    await q(
      `INSERT INTO ${ah("portal_identity_links")}
         (user_id, sf_contact_id, match_type, match_fields, status, confidence, flagged, flag_reason)
       VALUES ($1,$2,'auto_pair',$3,'active',$4,true,'name did not match') ON CONFLICT DO NOTHING`,
      [userId, best.contact.Id, JSON.stringify(best.fields), best.confidence]
    );
    return { matched: true, type: "auto_pair", flagged: true, contactId: best.contact.Id, fields: best.fields, confidence: best.confidence };
  }

  if (core === 1 || best.confidence > 0) {
    // a single-field hit — human decides. Queue it with the candidate list.
    await q(
      `INSERT INTO ${ah("portal_identity_links")}
         (user_id, sf_contact_id, match_type, match_fields, status, confidence)
       VALUES ($1,$2,'auto_partial',$3,'pending_review',$4) ON CONFLICT DO NOTHING`,
      [userId, best.contact.Id, JSON.stringify(best.fields), best.confidence]
    );
    return { matched: false, pending: true, contactId: best.contact.Id, fields: best.fields, confidence: best.confidence };
  }

  await q(
    `INSERT INTO ${ah("portal_identity_links")} (user_id, match_type, match_fields, status, confidence)
     VALUES ($1,'none','{}','active',0) ON CONFLICT DO NOTHING`,
    [userId]
  );
  return { matched: false };
}
