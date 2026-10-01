import { requireApiUser, isResp, json } from "@/lib/api";
import { q, ah, sf } from "@/lib/db";

export async function GET() {
  const user = await requireApiUser(["advisor", "manager", "admin"]);
  if (isResp(user)) return user;

  const [funnel, pendingLinks, reviewItems, reviewDocs, openChats, outbox, students, recentActivity] = await Promise.all([
    q(`SELECT "TargetX_SRMb__Status__c" AS k, count(*)::int AS n FROM ${sf("contact")} WHERE "TargetX_SRMb__Status__c" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
    q(`SELECT count(*)::int AS n FROM ${ah("portal_identity_links")} WHERE status='pending_review'`),
    q(`SELECT count(*)::int AS n FROM ${ah("portal_checklist_items")} WHERE status='submitted'`),
    q(`SELECT count(*)::int AS n FROM ${ah("portal_documents")} WHERE status='uploaded'`),
    q(`SELECT count(*)::int AS n FROM ${ah("portal_chat_threads")} WHERE status='open'`),
    q(`SELECT count(*)::int AS n FROM ${ah("portal_outbox")} WHERE status='pending'`),
    q(`SELECT count(*)::int AS n FROM ${ah("portal_users")} WHERE role='student'`),
    q(`SELECT a.kind, a.path, a.created_at, u.email FROM ${ah("portal_activity")} a LEFT JOIN ${ah("portal_users")} u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 12`),
  ]);

  return json({
    funnel: funnel.rows,
    pendingLinks: pendingLinks.rows[0].n,
    reviewQueue: reviewItems.rows[0].n + reviewDocs.rows[0].n,
    openChats: openChats.rows[0].n,
    outboxPending: outbox.rows[0].n,
    students: students.rows[0].n,
    recentActivity: recentActivity.rows,
  });
}
