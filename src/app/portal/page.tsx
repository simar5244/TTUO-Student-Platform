import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { q, ah } from "@/lib/db";
import { findContactById, contactApplications } from "@/lib/sf";
import { Card, Pill, PageHeader, statusTone } from "@/components/ui";
import { IconArrowR, IconCheckCircle, IconDoc, IconWarn } from "@/components/icons";
import { MascotCard, MascotState } from "@/components/Mascot";
import { ShareButton } from "@/components/ShareButton";

export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const link = (await q(`SELECT * FROM ${ah("portal_identity_links")} WHERE user_id=$1 AND status IN ('active','confirmed','pending_review') ORDER BY created_at DESC LIMIT 1`, [user.id])).rows[0];
  const contact = link?.sf_contact_id ? await findContactById(link.sf_contact_id) : null;
  const sfApps = link?.sf_contact_id ? await contactApplications(link.sf_contact_id) : [];
  const app = (await q(`SELECT * FROM ${ah("portal_applications")} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [user.id])).rows[0];
  const checklist = await q<{ status: string; n: number }>(
    `SELECT status, count(*)::int AS n FROM ${ah("portal_checklist_items")} WHERE user_id=$1 GROUP BY 1`, [user.id]);
  const docs = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM ${ah("portal_documents")} WHERE user_id=$1`, [user.id])).rows[0]?.n ?? 0;

  const done = checklist.rows.filter((r) => ["approved", "waived"].includes(r.status)).reduce((a, r) => a + r.n, 0);
  const total = checklist.rows.reduce((a, r) => a + r.n, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const first = (user.display_name || contact?.FirstName || "there").split(" ")[0];

  const hasApp = !!app || sfApps.length > 0;
  const finished = hasApp && total > 0 && done === total;
  const mascot: MascotState = !hasApp ? "sad" : finished ? "celebrate" : "encourage";

  return (
    <div className="space-y-5">
      <PageHeader title={`Hi, ${first}`} sub="Here's where your application stands." />

      {link?.status === "pending_review" && (
        <Card className="flex items-start gap-3 border-accent/40 bg-accent/[0.03] p-4">
          <IconWarn className="mt-0.5 shrink-0 text-accent" width={18} height={18} />
          <div className="text-sm">
            <span className="font-medium">We're verifying your record.</span>{" "}
            <span className="text-mute">Part of your info matched an existing record — an advisor is double-checking the link.</span>
          </div>
        </Card>
      )}

      {/* requirements overview — only once they've applied */}
      {hasApp && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-mute">Requirements</div>
            <div className="text-xs font-semibold">{done}/{total}</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-sm bg-smoke">
            <div className={`h-full transition-all ${finished ? "bg-accent" : "bg-ink"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-sm text-mute">{pct}% complete · {docs} document{docs === 1 ? "" : "s"} uploaded</div>
            {app && <Pill tone={statusTone(app.status)}>{app.status}</Pill>}
          </div>
          <div className="mt-1 text-sm">
            <span className="font-medium">{app?.program_name || sfApps[0]?.program_name || "Application"}</span>
            <span className="text-mute"> · {app?.term || sfApps[0]?.term || "Term TBD"}</span>
          </div>
        </Card>
      )}

      {/* mascot state */}
      <MascotCard
        state={mascot}
        title={!hasApp ? "No application yet…" : finished ? "You did it, Red Raider!" : "Keep going — you're getting there!"}
        sub={
          !hasApp
            ? "Raider Red is sitting here waiting on you. Pick a program, hit apply, and let's get you to Texas Tech."
            : finished
              ? "Everything's submitted and approved. An advisor will reach out soon — time to celebrate!"
              : `${pct}% of your requirements are done${docs ? ` · ${docs} document${docs === 1 ? "" : "s"} uploaded` : ""}. Every item checked off gets you closer.`
        }
        action={
          !hasApp ? (
            <Link href="/portal/apply" data-track="mascot-start"
              className="inline-flex w-full items-center justify-center gap-2 bg-accent px-5 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-dim sm:w-auto">
              Start my application <IconArrowR width={15} height={15} />
            </Link>
          ) : (
            <>
              <Link href={finished ? "/portal/messages" : "/portal/checklist"} data-track="mascot-checklist"
                className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap bg-ink px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-black">
                {finished ? "Message an advisor" : "Continue checklist"} <IconArrowR width={15} height={15} />
              </Link>
              <ShareButton program={app?.program_name || sfApps[0]?.program_name} term={app?.term || sfApps[0]?.term} />
            </>
          )
        }
      />

      {/* linked record */}
      {contact && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-mute">Linked university record</div>
            <Pill tone={link.status === "confirmed" ? "ok" : link.status === "pending_review" ? "warn" : "outline"}>
              {link.status === "confirmed" ? "verified" : link.status === "pending_review" ? "verifying" : "linked"}
            </Pill>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <IconCheckCircle width={16} height={16} className="text-ink" />
            <span className="font-medium">{contact.Name}</span>
            <span className="text-mute">· {contact.status || contact.record_type} · {contact.term || "—"}</span>
          </div>
        </Card>
      )}

      {/* all SF applications */}
      {sfApps.length > 0 && (
        <Card className="divide-y divide-line">
          <div className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-mute">Your applications on file</div>
          {sfApps.map((a: Record<string, string>) => (
            <div key={a.Id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <IconDoc width={17} height={17} className="text-mute" />
                <div>
                  <div className="text-sm font-medium">{a.program_name || a.app_number}</div>
                  <div className="text-xs text-mute">{a.term} · {a.record_type}</div>
                </div>
              </div>
              <Pill tone={statusTone(a.status)}>{a.status || a.stage || "—"}</Pill>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
