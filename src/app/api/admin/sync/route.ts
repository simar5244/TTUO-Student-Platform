import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { runSync, syncIntervalMinutes } from "@/lib/sync";

const ROLE = ["manager", "admin"] as const;

// GET: clone health + recent run history
export async function GET() {
  const user = await requireApiUser([...ROLE]);
  if (isResp(user)) return user;

  const [runs, counts, lastOk] = await Promise.all([
    q(
      `SELECT r.*, u.email AS actor_email FROM ${ah("sf_sync_runs")} r
       LEFT JOIN ${ah("portal_users")} u ON u.id = r.actor_id
       ORDER BY r.id DESC LIMIT 25`),
    q<{ table: string; n: number; latest: string | null }>(
      `SELECT 'sf_contact' AS table, count(*)::int AS n, max(synced_at)::text AS latest FROM ${ah("sf_contact")}
       UNION ALL SELECT 'sf_application', count(*)::int, max(synced_at)::text FROM ${ah("sf_application")}
       UNION ALL SELECT 'sf_contact_hist', count(*)::int, max(observed_at)::text FROM ${ah("sf_contact_hist")}
       UNION ALL SELECT 'sf_application_hist', count(*)::int, max(observed_at)::text FROM ${ah("sf_application_hist")}
       UNION ALL SELECT 'portal_contact_projection', count(*)::int, max(updated_at)::text FROM ${ah("portal_contact_projection")}`),
    q<{ t: string | null }>(`SELECT max(finished_at) AS t FROM ${ah("sf_sync_runs")} WHERE status='ok'`),
  ]);

  return json({
    intervalMinutes: syncIntervalMinutes(),
    lastSuccess: lastOk.rows[0]?.t ?? null,
    counts: counts.rows,
    runs: runs.rows,
  });
}

// POST {action:'run'} — manual refresh ("Refresh now")
export async function POST(req: NextRequest) {
  const user = await requireApiUser([...ROLE]);
  if (isResp(user)) return user;
  const body = await req.json().catch(() => ({}));
  if (body.action !== "run") return bad("action must be 'run'");

  const res = await runSync("manual", user.id);
  await audit(req, user, "admin_action", { action: "sync_manual", result: res.error ? "error" : res.skipped ? "skipped" : "ok" });
  if (res.error) return json({ ok: false, error: res.error, stats: res.stats }, 500);
  return json({ ok: !res.skipped, skipped: res.skipped, stats: res.stats });
}
