"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Pill, Button, Input, Empty, statusTone, Spinner, cn } from "@/components/ui";
import { IconCheck, IconX, IconLink, IconSearch } from "@/components/icons";

const FIELD_LABELS: [string, string][] = [["Email", "email"], ["Phone", "phone"], ["Last name", "last_name"], ["First name", "first_name"]];

function FieldChips({ f }: { f: Record<string, boolean> | null | undefined }) {
  if (!f) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {FIELD_LABELS.map(([label, k]) => (
        <span key={k} className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          f[k] ? "bg-ink text-white" : "bg-smoke text-mute")}>{label}</span>
      ))}
    </div>
  );
}

function Confidence({ n }: { n?: number | null }) {
  if (n == null) return null;
  const tone = n >= 75 ? "ok" : n >= 35 ? "warn" : "mute";
  return <Pill tone={tone}>{n}% match</Pill>;
}

export default function MatchPage() {
  const [d, setD] = useState<any>(null);
  const [contactSearch, setContactSearch] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, any[]>>({});
  const [busy, setBusy] = useState("");

  const load = useCallback(() => fetch("/api/admin/match").then((r) => r.json()).then(setD), []);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    await fetch("/api/admin/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(""); load();
  }

  async function searchContacts(userId: string) {
    const term = contactSearch[userId];
    if (!term) return;
    // browse hits the ENTIRE warehouse contact table, not just the online slice —
    // the student's lead may predate it
    const r = await fetch(`/api/admin/match?browse=${encodeURIComponent(term)}`);
    const d = await r.json();
    setSuggestions((s) => ({ ...s, [userId]: d.browse ?? [] }));
  }

  if (!d) return <div className="py-20 text-center"><Spinner /></div>;

  const Row = ({ label, value, match }: { label: string; value: React.ReactNode; match?: boolean }) => (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-mute">{label}</span>
      <span className={`text-right font-medium ${match === true ? "text-ink" : match === false ? "text-accent" : ""}`}>{value || "—"}</span>
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Match & merge" sub="Link portal accounts to Salesforce contacts. Confirming queues a merge note for the superadmin — nothing touches Salesforce automatically." />

      {/* pending review */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Needs review <span className="text-mute">({d.pending.length})</span></h2>
        {!d.pending.length && <Empty title="Queue clear" hint="No partial matches waiting." />}
        <div className="space-y-3">
          {d.pending.map((p: any) => (
            <Card key={p.id} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <FieldChips f={p.live_fields ?? p.match_fields} />
                <Confidence n={p.live_confidence ?? p.confidence} />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">Portal signup</div>
                  <Row label="Name" value={p.display_name} />
                  <Row label="Email" value={p.email} match={p.match_fields?.email} />
                  <Row label="Phone" value={p.phone} match={p.match_fields?.phone} />
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">SF record</div>
                  {p.contact ? (<>
                    <Row label="Name" value={p.contact.Name} />
                    <Row label="Email" value={p.contact.Email} match={p.match_fields?.email} />
                    <Row label="Phone" value={p.contact.MobilePhone || p.contact.Phone} match={p.match_fields?.phone} />
                    {p.contact.former_last && <Row label="Former last name" value={p.contact.former_last} match={p.match_fields?.last_name} />}
                    <Row label="City / State" value={[p.contact.city, p.contact.state].filter(Boolean).join(", ")} />
                    <Row label="Status" value={`${p.contact.status || "—"} · ${p.contact.term || ""}`} />
                  </>) : <p className="text-sm text-mute">No candidate found.</p>}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="px-3 py-1.5 text-xs" disabled={busy === p.id} onClick={() => act({ action: "confirm", linkId: p.id }, p.id)}>
                  <IconCheck width={13} height={13} /> Confirm link
                </Button>
                <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={busy === p.id} onClick={() => act({ action: "reject", linkId: p.id }, p.id)}>
                  <IconX width={13} height={13} /> Not the same person
                </Button>
                {p.contact && <a href={`/admin/people/${p.contact.Id}`} className="px-3 py-1.5 text-xs font-medium text-mute underline underline-offset-4">View record</a>}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* flagged auto-links — email+phone matched but name didn't */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Flagged auto-links <span className="text-mute">({d.flagged?.length ?? 0}) — matched on email+phone only</span></h2>
        {!d.flagged?.length && <Empty title="Nothing flagged" hint="Auto-links where the name didn't match show up here." />}
        <div className="space-y-3">
          {(d.flagged ?? []).map((p: any) => (
            <Card key={p.id} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <FieldChips f={p.live_fields ?? p.match_fields} />
                <Pill tone="warn">needs eyeball</Pill>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">Portal signup</div>
                  <Row label="Name" value={p.display_name} />
                  <Row label="Email" value={p.email} />
                  <Row label="Phone" value={p.phone} />
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">SF record</div>
                  {p.contact ? (<>
                    <Row label="Name" value={p.contact.Name} />
                    <Row label="Email" value={p.contact.Email} />
                    <Row label="Phone" value={p.contact.MobilePhone || p.contact.Phone} />
                    <Row label="Status" value={`${p.contact.status || "—"} · ${p.contact.term || ""}`} />
                  </>) : <p className="text-sm text-mute">No contact row.</p>}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="px-3 py-1.5 text-xs" disabled={busy === p.id} onClick={() => act({ action: "unflag", linkId: p.id }, p.id)}>
                  <IconCheck width={13} height={13} /> Looks right
                </Button>
                <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={busy === p.id} onClick={() => act({ action: "reject", linkId: p.id }, p.id)}>
                  <IconX width={13} height={13} /> Wrong person
                </Button>
                {p.contact && <a href={`/admin/people/${p.contact.Id}`} className="px-3 py-1.5 text-xs font-medium text-mute underline underline-offset-4">View record</a>}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* unlinked users — manual match */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Unlinked portal users <span className="text-mute">({d.unlinked.length})</span></h2>
        {!d.unlinked.length && <Empty title="Everyone is linked" />}
        <div className="space-y-3">
          {d.unlinked.map((u: any) => (
            <Card key={u.user_id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">{u.display_name || u.email}</div>
                  <div className="text-xs text-mute">{u.email} · {u.phone}</div>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Input placeholder="Search SF contacts…" className="py-1.5 text-xs sm:w-52"
                    value={contactSearch[u.user_id] || ""} onChange={(e) => setContactSearch({ ...contactSearch, [u.user_id]: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && searchContacts(u.user_id)} />
                  <Button variant="outline" className="px-3 py-1.5" onClick={() => searchContacts(u.user_id)}><IconSearch width={14} height={14} /></Button>
                </div>
              </div>
              {!!u.candidates?.length && (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">Suggested</div>
                  {u.candidates.map((cand: any) => (
                    <div key={cand.Id} className="py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>{cand.Name} <span className="text-xs text-mute">· {cand.Email} · {cand.status} · {[cand.city, cand.state].filter(Boolean).join(", ")}</span></span>
                        <span className="flex items-center gap-2">
                          <Confidence n={cand.confidence} />
                          <Button variant="ghost" className="px-2 py-1 text-xs" disabled={busy === cand.Id}
                            onClick={() => act({ action: "link", userId: u.user_id, contactId: cand.Id }, cand.Id)}>
                            <IconLink width={13} height={13} /> Link
                          </Button>
                        </span>
                      </div>
                      <div className="mt-1"><FieldChips f={cand.fields} /></div>
                    </div>
                  ))}
                </div>
              )}
              {(suggestions[u.user_id] || []).map((cand: any) => (
                <div key={cand.Id} className="flex items-center justify-between py-1.5 text-sm">
                  <span>{cand.Name} <span className="text-xs text-mute">· {cand.Email} · {cand.status}</span></span>
                  <Button variant="ghost" className="px-2 py-1 text-xs" disabled={busy === cand.Id}
                    onClick={() => act({ action: "link", userId: u.user_id, contactId: cand.Id }, cand.Id)}>
                    <IconLink width={13} height={13} /> Link
                  </Button>
                </div>
              ))}
            </Card>
          ))}
        </div>
      </section>

      {/* auto-linked audit */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Auto-linked <span className="text-mute">({d.autoLinked.length}) — spot-check these</span></h2>
        <Card className="divide-y divide-line">
          {!d.autoLinked.length && <div className="px-5 py-6 text-sm text-mute">None yet.</div>}
          {d.autoLinked.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between px-5 py-3">
              <div className="text-sm">
                <span className="font-medium">{a.display_name || a.email}</span>
                <span className="text-mute"> ⇄ </span>
                <span>{a.contact?.Name} <span className="text-xs text-mute">({a.contact?.Email})</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Confidence n={a.confidence} />
                <Pill tone={statusTone(a.status)}>{a.status}</Pill>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => act({ action: "confirm", linkId: a.id }, a.id)}>Verify</Button>
                <Button variant="ghost" className="px-2 py-1 text-xs text-accent" onClick={() => act({ action: "reject", linkId: a.id }, a.id)}>Wrong</Button>
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
