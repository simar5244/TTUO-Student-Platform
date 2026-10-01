import { requireApiUser, isResp, json } from "@/lib/api";
import { q, ah } from "@/lib/db";

// Time-on-site + page stats (manager+)
export async function GET() {
  const user = await requireApiUser(["manager", "admin"]);
  if (isResp(user)) return user;

  const [byPage, byUser, daily] = await Promise.all([
    q(`SELECT path, count(*)::int AS views, COALESCE(sum(duration_ms),0)::int AS total_ms,
              count(DISTINCT session_id)::int AS sessions
       FROM ${ah("portal_activity")} WHERE kind='page_view' AND path IS NOT NULL
       GROUP BY path ORDER BY views DESC LIMIT 20`),
    q(`SELECT u.email, u.display_name, u.role,
              count(*) FILTER (WHERE a.kind='page_view')::int AS views,
              COALESCE(sum(a.duration_ms),0)::int AS total_ms,
              max(a.created_at) AS last_seen
       FROM ${ah("portal_activity")} a JOIN ${ah("portal_users")} u ON u.id=a.user_id
       GROUP BY u.id ORDER BY total_ms DESC LIMIT 50`),
    q(`SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS events,
              count(DISTINCT session_id)::int AS sessions, count(DISTINCT user_id)::int AS users
       FROM ${ah("portal_activity")} WHERE created_at > now() - interval '30 days'
       GROUP BY 1 ORDER BY 1 DESC`),
  ]);

  return json({ byPage: byPage.rows, byUser: byUser.rows, daily: daily.rows });
}
