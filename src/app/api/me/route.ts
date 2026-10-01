import { requireApiUser, isResp, json } from "@/lib/api";
import { findContactById, contactApplications } from "@/lib/sf";
import { q, ah } from "@/lib/db";

export async function GET() {
  const user = await requireApiUser();
  if (isResp(user)) return user;

  const [link, portalApp, checklist, docs] = await Promise.all([
    q(`SELECT * FROM ${ah("portal_identity_links")} WHERE user_id=$1 AND status IN ('active','confirmed','pending_review') ORDER BY created_at DESC LIMIT 1`, [user.id]),
    q(`SELECT * FROM ${ah("portal_applications")} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [user.id]),
    q(`SELECT status, count(*)::int AS n FROM ${ah("portal_checklist_items")} WHERE user_id=$1 GROUP BY 1`, [user.id]),
    q(`SELECT count(*)::int AS n FROM ${ah("portal_documents")} WHERE user_id=$1`, [user.id]),
  ]);

  const linkRow = link.rows[0] ?? null;
  const contact = linkRow?.sf_contact_id ? await findContactById(linkRow.sf_contact_id) : null;
  const sfApps = linkRow?.sf_contact_id ? await contactApplications(linkRow.sf_contact_id) : [];

  return json({
    user: { id: user.id, email: user.email, role: user.role, name: user.display_name, phone: user.phone, mfa: user.mfa_enabled },
    link: linkRow,
    contact,
    sfApplications: sfApps,
    portalApplication: portalApp.rows[0] ?? null,
    checklist: checklist.rows,
    docCount: docs.rows[0]?.n ?? 0,
  });
}
