"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Pill, Button, Empty, statusTone, Spinner } from "@/components/ui";
import { Dropdown } from "@/components/Dropdown";
import { IconDoc, IconDownload, IconCheck, IconX, IconSend } from "@/components/icons";

type Cand = { id: string; name: string | null; status: string | null; req_code: string | null };
type Doc = {
  id: string; filename: string; mime: string; size: number; status: string; note: string | null;
  uploaded_at: string; req_key: string | null; sf_item_id: string | null; sf_app_id: string | null;
  sf_confirmed_at: string | null; item_name: string | null;
  email: string; display_name: string | null; user_id: string; sf_contact_id: string | null;
  candidates: Cand[];
};

// Upload bridge: students drop files here, staff pull them into RaiderConnect
// by hand, mark them pushed, and the SF sync flips them to approved on parity.
export default function DocumentsAdmin() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const load = useCallback(() =>
    fetch("/api/admin/documents").then((r) => r.json()).then((d) => setDocs(d.documents ?? [])), []);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    const r = await fetch("/api/admin/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy("");
    if (r.ok) load();
  }

  if (!docs) return <div className="py-20 text-center"><Spinner /></div>;
  const pending = docs.filter((d) => d.status === "pending_review");
  const pushed = docs.filter((d) => d.status === "pushed");
  const fmt = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

  const DocRow = ({ d, queue }: { d: Doc; queue: "pending" | "pushed" }) => (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-smoke"><IconDoc width={17} height={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{d.filename}</span>
            <Pill tone={statusTone(d.status)}>{d.status.replace(/_/g, " ")}</Pill>
          </div>
          <div className="mt-0.5 text-xs text-mute">
            {d.display_name || d.email} · {fmt(d.size)} · {new Date(d.uploaded_at).toLocaleString()}
            {d.item_name ? ` · ${d.item_name}` : d.req_key ? ` · req ${d.req_key}` : " · unattached"}
          </div>
          {queue === "pushed" && (
            <div className="mt-0.5 text-xs text-mute">
              {d.sf_item_id ? `attached to SF item ${d.sf_item_id}` : "pushed without item reference"} — waiting for parity
            </div>
          )}
          {queue === "pending" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {d.candidates?.length > 0 && (
                <div className="w-full max-w-sm">
                  <Dropdown
                    value={pick[d.id] ?? d.sf_item_id ?? ""}
                    onChange={(v) => setPick({ ...pick, [d.id]: v })}
                    placeholder="Attach to checklist item…" searchable
                    options={d.candidates.map((c) => ({ value: c.id, label: c.name ?? c.id, sub: c.req_code ?? undefined }))} />
                </div>
              )}
              <Button className="px-3 py-1.5 text-xs" disabled={busy === d.id}
                onClick={() => act({ action: "push", id: d.id, sf_item_id: pick[d.id] ?? d.sf_item_id }, d.id)}>
                <IconSend width={13} height={13} /> Mark pushed to SF
              </Button>
              <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={busy === d.id}
                onClick={() => act({ action: "reject", id: d.id, note: prompt("Reason (shown to student)?") || "Rejected" }, d.id)}>
                <IconX width={13} height={13} /> Reject
              </Button>
              {!d.sf_app_id && <span className="text-xs text-mute">No SF application found for this student yet.</span>}
            </div>
          )}
          {queue === "pushed" && (
            <Button variant="ghost" className="mt-2 px-2 py-1 text-xs" disabled={busy === d.id}
              onClick={() => act({ action: "requeue", id: d.id }, d.id)}>Back to review</Button>
          )}
        </div>
        <a href={`/api/files/${d.id}`} target="_blank"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line hover:border-ink" aria-label="Download">
          <IconDownload width={15} height={15} />
        </a>
      </div>
    </Card>
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Document queue"
        sub="Student uploads. Download each file, attach it in RaiderConnect, then mark it pushed — the sync confirms it as received on the next pass." />

      <section>
        <h2 className="mb-3 text-sm font-semibold">Needs review <span className="text-mute">({pending.length})</span></h2>
        {!pending.length && <Empty title="Queue clear" hint="No uploads waiting." />}
        <div className="space-y-3">{pending.map((d) => <DocRow key={d.id} d={d} queue="pending" />)}</div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Pushed — awaiting parity <span className="text-mute">({pushed.length})</span></h2>
        {!pushed.length && <Empty title="Nothing in flight" />}
        <div className="space-y-3">{pushed.map((d) => <DocRow key={d.id} d={d} queue="pushed" />)}</div>
      </section>
    </div>
  );
}
