"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Pill, Button, Input, Empty, statusTone, Spinner, cn } from "@/components/ui";
import { IconCheck, IconX, IconLink, IconSearch } from "@/components/icons";

const FIELD_LABELS: [string, string][] = [["Email", "email"], ["Phone", "phone"], ["Last name", "last_name"], ["First name", "first_name"]];
const FIELD_ORDER = ["email", "phone", "first_name", "last_name"];
const FIELD_SHORT: Record<string, string> = { email: "email", phone: "phone", first_name: "first name", last_name: "last name" };

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

// Group candidates by exactly which fields matched — "email + phone" is its own
// tier, "email + phone + first name" the next, etc. Ordered strongest first.
function groupBySignature(cands: any[]) {
  const groups = new Map<string, any[]>();
  for (const c of cands) {
    const sig = FIELD_ORDER.filter((k) => c.fields?.[k]).join("+");
    if (!sig) continue;
    groups.set(sig, [...(groups.get(sig) ?? []), c]);
  }
  return [...groups.entries()]
    .sort((a, b) => {
      // more fields = higher rank; within same count, email/phone heavier
      const score = (sig: string) =>
        sig.split("+").length * 10 + sig.split("+").reduce((s, k) => s + (k === "email" ? 4 : k === "phone" ? 3 : 1), 0);
      return score(b[0]) - score(a[0]);
    })
    .map(([sig, rows]) => ({ sig, label: sig.split("+").map((k) => FIELD_SHORT[k]).join(" + "), rows }));
}

// Detail modal — everything we know about the SF record, Link button bottom-right.
function CandidateModal({ userId, userInfo, contactId, onClose, onLink, busy }: {
  userId: string; userInfo: any; contactId: string;
  onClose: () => void; onLink: () => void; busy: boolean;
}) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/admin/match?preview=${encodeURIComponent(contactId)}`)
      .then((r) => r.json()).then((x) => x.error ? setErr(x.error) : setD(x));
  }, [contactId]);
  const c = d?.contact;

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between gap-3 border-b border-line/60 py-1.5 text-sm last:border-0">
      <span className="text-mute">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="text-sm font-semibold">Salesforce record</div>
            <div className="text-xs text-mute">Linking <span className="font-medium text-ink">{userInfo.display_name || userInfo.email}</span> ({userInfo.email} · {userInfo.phone || "no phone"})</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-mute hover:bg-smoke"><IconX width={16} height={16} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {err && <Empty title="Couldn't load record" hint={err} />}
          {!d && !err && <div className="py-10 text-center"><Spinner /></div>}
          {c && (<>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-mute">Contact</div>
              <Row label="Name" value={c.Name} />
              <Row label="First / Last" value={`${c.FirstName ?? "—"} / ${c.LastName ?? "—"}`} />
              <Row label="Email" value={c.Email} />
              <Row label="Phone" value={c.MobilePhone || c.Phone} />
              <Row label="Status" value={`${c.status || "—"} · ${c.record_type || ""}`} />
              <Row label="Term" value={c.term} />
              <Row label="City / State" value={[c.city, c.state].filter(Boolean).join(", ")} />
              <Row label="Lead source" value={c.lead_source} />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-mute">
                Applications <span className="normal-case">({d.applications.length})</span>
              </div>
              {!d.applications.length && <p className="py-2 text-sm text-mute">No applications on this contact.</p>}
              {d.applications.map((a: any) => (
                <div key={a.Id} className="border-b border-line/60 py-2 text-sm last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.app_number || a.Id}</span>
                    <Pill tone={statusTone(a.status || a.stage)}>{a.status || a.stage || "—"}</Pill>
                  </div>
                  <div className="mt-0.5 text-xs text-mute">
                    {a.program_name || "—"} · {a.term || "term?"} · checklist {a.checklist_done ?? 0}/{a.checklist_total ?? 0}
                    {a.submitted ? " · submitted" : ""}
                  </div>
                </div>
              ))}
            </div>
            {!!d.checklist_items?.length && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-mute">
                  Checklist <span className="normal-case">({d.checklist_done}/{d.checklist_total} done)</span>
                </div>
                {d.checklist_items.map((i: any) => (
                  <div key={i.id} className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm last:border-0">
                    <span>{i.name || "Requirement"} <span className="text-[10px] font-semibold text-accent">{i.req_code || ""}</span></span>
                    <Pill tone={i.done ? "ok" : "mute"}>{i.status || (i.done ? "done" : "open")}</Pill>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <span className="text-xs text-mute">Linking queues a merge note for the superadmin — Salesforce is never written automatically.</span>
          <div className="flex gap-2">
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onClose}>Cancel</Button>
            <Button className="px-4 py-1.5 text-xs" disabled={!c || busy} onClick={onLink}>
              <IconLink width={13} height={13} /> Link record
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MatchPage() {
  const [d, setD] = useState<any>(null);
  const [contactSearch, setContactSearch] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, any[]>>({});
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState<null | { userId: string; userInfo: any; contactId: string }>(null);

  const load = useCallback(() => fetch("/api/admin/match").then((r) => r.json()).then(setD), []);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    await fetch("/api/admin/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(""); setModal(null); load();
  }

  async function searchContacts(userId: string) {
    const term = contactSearch[userId];
    if (!term) return;
    const r = await fetch(`/api/admin/match?browse=${encodeURIComponent(term)}`);
    const data = await r.json();
    setSuggestions((s) => ({ ...s, [userId]: data.browse ?? [] }));
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
      <PageHeader title="ID Links" sub="Link portal accounts to Salesforce records. Confirming a link queues a note in the SF outbox — nothing touches Salesforce automatically."
        right={<a href="/admin/outbox" className="text-xs text-mute underline underline-offset-2 hover:text-ink">Salesforce to-do list →</a>} />

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
                {p.contact && <Button variant="ghost" className="px-3 py-1.5 text-xs"
                  onClick={() => setModal({ userId: p.user_id, userInfo: p, contactId: p.contact.Id })}>View record</Button>}
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
                {p.contact && <Button variant="ghost" className="px-3 py-1.5 text-xs"
                  onClick={() => setModal({ userId: p.user_id, userInfo: p, contactId: p.contact.Id })}>View record</Button>}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* unlinked users — candidates grouped by which fields matched */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Unlinked portal users <span className="text-mute">({d.unlinked.length})</span></h2>
        {!d.unlinked.length && <Empty title="Everyone is linked" />}
        <div className="space-y-3">
          {d.unlinked.map((u: any) => {
            const groups = groupBySignature(u.candidates ?? []);
            return (
              <Card key={u.user_id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium">{u.display_name || u.email}</div>
                    <div className="text-xs text-mute">{u.email} · {u.phone}</div>
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Input placeholder="Search all SF contacts…" className="py-1.5 text-xs sm:w-52"
                      value={contactSearch[u.user_id] || ""} onChange={(e) => setContactSearch({ ...contactSearch, [u.user_id]: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && searchContacts(u.user_id)} />
                    <Button variant="outline" className="px-3 py-1.5" onClick={() => searchContacts(u.user_id)}><IconSearch width={14} height={14} /></Button>
                  </div>
                </div>

                {!!groups.length && (
                  <div className="mt-3 space-y-3 border-t border-line pt-3">
                    {groups.map((g) => (
                      <div key={g.sig}>
                        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-mute">
                          {g.label} <span className="normal-case">match{g.rows.length === 1 ? "" : "es"} ({g.rows.length})</span>
                        </div>
                        {g.rows.map((cand: any) => (
                          <button key={cand.Id} onClick={() => setModal({ userId: u.user_id, userInfo: u, contactId: cand.Id })}
                            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-smoke/60">
                            <span>{cand.Name} <span className="text-xs text-mute">· {cand.Email} · {cand.status} · {[cand.city, cand.state].filter(Boolean).join(", ")}</span></span>
                            <span className="flex items-center gap-2"><Confidence n={cand.confidence} /><FieldChips f={cand.fields} /></span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {!groups.length && !suggestions[u.user_id]?.length && (
                  <p className="mt-3 border-t border-line pt-3 text-xs text-mute">
                    No matching records found in the synced data yet. If they applied in the last few hours, the
                    Salesforce→warehouse pipe may not have landed them — try the search, or refresh after the next sync.
                  </p>
                )}

                {(suggestions[u.user_id] || []).map((cand: any) => (
                  <button key={cand.Id} onClick={() => setModal({ userId: u.user_id, userInfo: u, contactId: cand.Id })}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-smoke/60">
                    <span>{cand.Name} <span className="text-xs text-mute">· {cand.Email} · {cand.status}</span></span>
                    <span className="text-xs text-mute">view →</span>
                  </button>
                ))}
              </Card>
            );
          })}
        </div>
      </section>

      {/* linked records — every active/confirmed link stays visible */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Linked <span className="text-mute">({d.autoLinked.length}) — spot-check these</span></h2>
        <Card className="divide-y divide-line">
          {!d.autoLinked.length && <div className="px-5 py-6 text-sm text-mute">None yet.</div>}
          {d.autoLinked.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between px-5 py-3">
              <div className="text-sm">
                <span className="font-medium">{a.display_name || a.email}</span>
                <span className="text-mute"> ⇄ </span>
                <button className="text-left underline-offset-2 hover:underline" onClick={() => a.sf_contact_id && setModal({ userId: a.user_id, userInfo: a, contactId: a.sf_contact_id })}>
                  {a.contact?.Name} <span className="text-xs text-mute">({a.contact?.Email})</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Confidence n={a.confidence} />
                <Pill tone="mute">{a.match_type}</Pill>
                <Pill tone={statusTone(a.status)}>{a.status}</Pill>
                {a.status === "active" && <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => act({ action: "confirm", linkId: a.id }, a.id)}>Verify</Button>}
                <Button variant="ghost" className="px-2 py-1 text-xs text-accent" onClick={() => act({ action: "unlink", linkId: a.id }, a.id)}>Unlink</Button>
              </div>
            </div>
          ))}
        </Card>
      </section>

      {modal && (
        <CandidateModal
          userId={modal.userId} userInfo={modal.userInfo} contactId={modal.contactId}
          busy={busy === modal.contactId}
          onClose={() => setModal(null)}
          onLink={() => act({ action: "link", userId: modal.userId, contactId: modal.contactId }, modal.contactId)}
        />
      )}
    </div>
  );
}
