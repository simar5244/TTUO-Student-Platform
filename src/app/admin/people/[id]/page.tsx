"use client";

import { use, useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Pill, Button, Input, statusTone, Spinner, Empty } from "@/components/ui";
import { IconMail, IconPhone, IconDoc, IconUpload, IconLink, IconClock } from "@/components/icons";

export default function PersonPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ app?: string }>;
}) {
  const { id } = use(params);
  const { app } = use(searchParams);
  const [d, setD] = useState<any>(null);
  const [note, setNote] = useState("");
  const [statusVal, setStatusVal] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => fetch(`/api/admin/person/${id}`).then((r) => r.json()).then(setD), [id]);
  useEffect(() => { load(); }, [load]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/admin/person/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: note }) });
    setNote(""); load();
  }

  async function pushStatus(appId: string, action: string, value: string) {
    if (!value) return;
    setBusy(true);
    await fetch("/api/admin/status", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: "application", entityId: appId, action, value, note }) });
    setBusy(false); setMsg(`Queued "${value}" for Salesforce — superadmin applies it.`);
  }

  if (!d) return <div className="py-20 text-center"><Spinner /></div>;
  const c = d.contact;
  const link = d.links?.[0];

  return (
    <div className="space-y-5">
      <PageHeader title={c?.Name || "Unknown"} sub={`${c?.record_type || ""} · SF contact ${id}`} />

      {msg && <Card className="border-ink/20 bg-smoke p-3 text-sm">{msg}</Card>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* left: contact card */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-mute">Contact</span>
              <Pill tone={statusTone(c?.status)}>{c?.status || "—"}</Pill>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center gap-2"><IconMail width={14} height={14} className="text-mute" /><span className="truncate">{c?.Email || "—"}</span></div>
              <div className="flex items-center gap-2"><IconPhone width={14} height={14} className="text-mute" /><span>{c?.MobilePhone || c?.Phone || "—"}</span></div>
              <div className="flex items-center gap-2"><IconClock width={14} height={14} className="text-mute" /><span>{[c?.city, c?.state].filter(Boolean).join(", ") || "—"}</span></div>
            </div>
            <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
              <div className="flex justify-between"><dt className="text-mute">Lead source</dt><dd>{c?.lead_source || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-mute">Anticipated term</dt><dd>{c?.term || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-mute">Banner ID</dt><dd>{c?.banner_id || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-mute">Created</dt><dd>{c?.created ? new Date(c.created).toLocaleDateString() : "—"}</dd></div>
            </dl>
          </Card>

          {/* portal link */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-mute">Portal account</span>
              {link && <Pill tone={statusTone(link.status)}>{link.status.replace(/_/g, " ")}</Pill>}
            </div>
            {link ? (
              <div className="mt-3 text-sm">
                <div className="flex items-center gap-2"><IconLink width={14} height={14} className="text-mute" />{link.portal_email}</div>
                <div className="mt-1 text-xs text-mute">via {link.match_type} · {link.portal_name || ""}</div>
              </div>
            ) : <p className="mt-3 text-sm text-mute">No portal account linked.</p>}
          </Card>

          {/* notes */}
          <Card className="p-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-mute">Advisor notes</span>
            <form onSubmit={addNote} className="mt-3 flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
              <Button variant="outline" className="px-3">Add</Button>
            </form>
            <div className="mt-3 space-y-2.5">
              {d.notes?.map((n: any) => (
                <div key={n.id} className="rounded-md bg-smoke p-3 text-sm">
                  <div className="text-xs text-mute">{n.author || "staff"} · {new Date(n.created_at).toLocaleDateString()}</div>
                  <div className="mt-0.5">{n.body}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* right: applications + checklist + docs */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-mute">Applications ({d.applications?.length ?? 0})</span>
            </div>
            <div className="divide-y divide-line">
              {d.applications?.map((a: any) => (
                <div key={a.Id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <IconDoc width={17} height={17} className="text-mute" />
                      <div>
                        <div className="text-sm font-medium">{a.program_name || a.app_number}</div>
                        <div className="text-xs text-mute">{a.app_number} · {a.record_type} · {a.term}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone="outline">{a.stage}</Pill>
                      <Pill tone={statusTone(a.status)}>{a.status || "—"}</Pill>
                    </div>
                  </div>
                  {/* status override (queues SF change for superadmin) */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Input placeholder="Set status (e.g. Accepted, Denied)" value={statusVal} onChange={(e) => setStatusVal(e.target.value)} className="w-56 py-1.5 text-xs" />
                    <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={busy || !statusVal}
                      onClick={() => pushStatus(a.Id, "set_status", statusVal)}>Queue to SF</Button>
                    <Button variant="ghost" className="px-3 py-1.5 text-xs text-accent" disabled={busy}
                      onClick={() => pushStatus(a.Id, "merge_request", "duplicate_review")}>Flag for merge</Button>
                  </div>
                </div>
              ))}
              {!d.applications?.length && <div className="px-5 py-6 text-sm text-mute">No applications on file — this is a lead.</div>}
            </div>
          </Card>

          {d.portalApplication && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-mute">Portal application</span>
                <Pill tone={statusTone(d.portalApplication.status)}>{d.portalApplication.status}</Pill>
              </div>
              <div className="mt-2 text-sm">{d.portalApplication.program_name} · {d.portalApplication.term}</div>
            </Card>
          )}

          {!!d.checklist?.length && (
            <Card>
              <div className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-mute">Checklist</div>
              <div className="divide-y divide-line">
                {d.checklist.map((it: any) => (
                  <div key={it.id} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm">{it.label}</span>
                    <Pill tone={statusTone(it.status)}>{it.status.replace(/_/g, " ")}</Pill>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!!d.documents?.length && (
            <Card>
              <div className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-mute">Documents</div>
              <div className="divide-y divide-line">
                {d.documents.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between px-5 py-3">
                    <a href={`/api/files/${doc.id}`} target="_blank" className="flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline">
                      <IconUpload width={14} height={14} className="text-mute" />{doc.filename}
                    </a>
                    <Pill tone={statusTone(doc.status)}>{doc.status}</Pill>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!!d.interactions?.length && (
            <Card>
              <div className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-mute">SF interactions</div>
              <div className="divide-y divide-line">
                {d.interactions.map((i: any) => (
                  <div key={i.Id} className="flex justify-between px-5 py-2.5 text-sm">
                    <span>{i.Name}</span><span className="text-xs text-mute">{i.date ? new Date(i.date).toLocaleDateString() : ""}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!!d.recentActivity?.length && (
            <Card>
              <div className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-mute">Portal activity</div>
              <div className="divide-y divide-line">
                {d.recentActivity.map((a: any, i: number) => (
                  <div key={i} className="flex justify-between px-5 py-2 text-xs">
                    <span className="text-mute">{a.kind} {a.path ? `· ${a.path}` : ""}{a.duration_ms ? ` · ${Math.round(a.duration_ms / 1000)}s` : ""}</span>
                    <span className="text-mute">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
