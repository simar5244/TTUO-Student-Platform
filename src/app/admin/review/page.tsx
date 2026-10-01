"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Input, Button, Empty, Spinner } from "@/components/ui";
import { IconCheck, IconX, IconDoc } from "@/components/icons";

export default function ReviewPage() {
  const [d, setD] = useState<{ items: any[]; documents: any[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});

  const load = useCallback(() => fetch("/api/admin/review").then((r) => r.json()).then(setD), []);
  useEffect(() => { load(); }, [load]);

  async function decide(kind: "item" | "doc", id: string, decision: string) {
    setBusy(id);
    await fetch("/api/admin/review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, decision, note: rejectNote[id] || undefined }),
    });
    setBusy(""); load();
  }

  if (!d) return <div className="py-20 text-center"><Spinner /></div>;

  return (
    <div className="space-y-8">
      <PageHeader title="Review queue" sub="Approve or reject submitted requirements and uploaded documents" />

      <section>
        <h2 className="mb-3 text-sm font-semibold">Documents awaiting review ({d.documents.length})</h2>
        {!d.documents.length && <Empty title="Nothing to review" />}
        <div className="space-y-3">
          {d.documents.map((doc) => (
            <Card key={doc.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-smoke"><IconDoc width={16} height={16} /></span>
                  <div className="min-w-0">
                    <a href={`/api/files/${doc.id}`} target="_blank" className="block truncate text-sm font-medium underline-offset-4 hover:underline">{doc.filename}</a>
                    <div className="text-xs text-mute">{doc.display_name || doc.email} · {doc.item_label || "general"} · {new Date(doc.uploaded_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input placeholder="Rejection note…" className="w-40 py-1.5 text-xs" value={rejectNote[doc.id] || ""} onChange={(e) => setRejectNote({ ...rejectNote, [doc.id]: e.target.value })} />
                  <Button className="px-3 py-1.5 text-xs" disabled={busy === doc.id} onClick={() => decide("doc", doc.id, "approved")}><IconCheck width={13} height={13} /> Approve</Button>
                  <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={busy === doc.id} onClick={() => decide("doc", doc.id, "rejected")}><IconX width={13} height={13} /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Checklist items submitted ({d.items.length})</h2>
        {!d.items.length && <Empty title="Nothing submitted" />}
        <div className="space-y-3">
          {d.items.map((it) => (
            <Card key={it.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="text-sm font-medium">{it.label} {it.required && <span className="text-[10px] font-semibold text-accent">REQ</span>}</div>
                <div className="text-xs text-mute">{it.display_name || it.email} · {it.program_name || ""} {it.term || ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="Note…" className="w-36 py-1.5 text-xs" value={rejectNote[it.id] || ""} onChange={(e) => setRejectNote({ ...rejectNote, [it.id]: e.target.value })} />
                <Button className="px-3 py-1.5 text-xs" disabled={busy === it.id} onClick={() => decide("item", it.id, "approved")}><IconCheck width={13} height={13} /></Button>
                <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={busy === it.id} onClick={() => decide("item", it.id, "rejected")}><IconX width={13} height={13} /></Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy === it.id} onClick={() => decide("item", it.id, "waived")}>Waive</Button>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
