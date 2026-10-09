import Link from "next/link";
import { PageHeader, Card, Stat, Pill, statusTone } from "@/components/ui";
import { getSessionUser } from "@/lib/auth";
import { q, ah } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = (await getSessionUser())!;
  const staff = ["manager", "admin"].includes(user.role);

  const [funnel, pendingLinks, reviewItems, reviewDocs, openChats, outbox, students, recent, lastSync] = await Promise.all([
    q<{ k: string; n: number }>(`SELECT status AS k, count(*)::int AS n FROM ${ah("sf_contact")} WHERE status IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM ${ah("portal_identity_links")} WHERE status='pending_review'`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM ${ah("portal_checklist_items")} WHERE status='submitted'`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM ${ah("portal_documents")} WHERE status='uploaded'`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM ${ah("portal_chat_threads")} WHERE status='open'`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM ${ah("portal_outbox")} WHERE status='pending'`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM ${ah("portal_users")} WHERE role='student'`),
    q<{ kind: string; path: string; created_at: string; email: string }>(`SELECT a.kind, a.path, a.created_at, u.email FROM ${ah("portal_activity")} a LEFT JOIN ${ah("portal_users")} u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 10`),
    q<{ t: string | null }>(`SELECT max(finished_at) AS t FROM ${ah("sf_sync_runs")} WHERE status='ok'`).catch(() => ({ rows: [{ t: null }] })),
  ]);

  const funnelTotal = funnel.rows.reduce((a, r) => a + r.n, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" sub="Admissions at a glance" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/admin/review"><Stat label="Review queue" value={reviewItems.rows[0].n + reviewDocs.rows[0].n} sub="checklist items + docs" /></Link>
        <Link href="/admin/match"><Stat label="Links to verify" value={pendingLinks.rows[0].n} sub="partial matches" /></Link>
        <Link href="/admin/chat"><Stat label="Open chats" value={openChats.rows[0].n} sub="awaiting advisor" /></Link>
        <Stat label="Portal students" value={students.rows[0].n} sub="signed up" />
        {staff && (
          <Link href="/admin/sync">
            <Stat label="SF clone" value={lastSync.rows[0].t ? new Date(lastSync.rows[0].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "never"} sub="last successful sync" />
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Pipeline</h3>
            <Link href="/admin/leads" className="text-xs font-medium text-mute hover:text-ink">All leads →</Link>
          </div>
          <div className="space-y-2.5">
            {funnel.rows.map((r) => (
              <div key={r.k} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-mute">{r.k || "—"}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-smoke">
                  <div className={`h-full rounded-md ${r.k === "Admit" || r.k === "Enrolled" ? "bg-accent" : "bg-ink"}`}
                    style={{ width: `${Math.max((r.n / funnelTotal) * 100, 1.5)}%` }} />
                </div>
                <span className="w-14 text-right text-xs font-medium tabular-nums">{r.n.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent activity</h3>
            {user.role === "admin" && <Link href="/admin/audit" className="text-xs font-medium text-mute hover:text-ink">Audit trail →</Link>}
          </div>
          <div className="space-y-2">
            {recent.rows.length === 0 && <p className="text-sm text-mute">No activity yet.</p>}
            {recent.rows.map((r, i: number) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Pill tone={r.kind === "admin_action" ? "warn" : "mute"}>{r.kind.replace(/_/g, " ")}</Pill>
                  <span className="truncate text-mute">{r.email || "anon"} {r.path ? `· ${r.path}` : ""}</span>
                </div>
                <span className="shrink-0 text-xs text-mute">{new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {user.role === "admin" && (
        <Card className="flex items-center justify-between p-5">
          <div>
            <div className="text-sm font-semibold">Salesforce outbox</div>
            <div className="text-xs text-mute">{outbox.rows[0].n} change{outbox.rows[0].n === 1 ? "" : "s"} waiting to be applied to Salesforce manually</div>
          </div>
          <Link href="/admin/outbox" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">Review</Link>
        </Card>
      )}
      {!staff && null}
    </div>
  );
}
