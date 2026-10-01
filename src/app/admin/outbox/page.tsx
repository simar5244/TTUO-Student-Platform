"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Pill, Button, Select, Empty } from "@/components/ui";
import { IconCheck, IconX } from "@/components/icons";

type Item = { id: string; entity_type: string; entity_id: string; action: string; payload: any; status: string; actor: string; created_at: string; note: string };

export default function OutboxPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("pending");

  const load = useCallback(() =>
    fetch(`/api/admin/outbox?status=${status}`).then((r) => r.json()).then((d) => setItems(d.items ?? [])), [status]);
  useEffect(() => { load(); }, [load]);

  async function mark(id: string, done: boolean) {
    await fetch("/api/admin/outbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, done }) });
    load();
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Salesforce outbox" sub="Changes queued by staff — apply each one in Salesforce manually, then mark done."
        right={<Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="pending">Pending</option><option value="done">Done</option><option value="skipped">Skipped</option><option value="all">All</option>
        </Select>} />

      {!items.length && <Empty title={`No ${status} changes`} hint="Status changes and merge requests queued by staff appear here." />}

      <div className="space-y-2.5">
        {items.map((o) => (
          <Card key={o.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Pill tone="outline">{o.entity_type}</Pill>
                  <span className="text-sm font-semibold">{o.action}</span>
                </div>
                <div className="mt-1 break-all font-mono text-xs text-mute">{o.entity_id}</div>
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-smoke p-2 text-xs">{JSON.stringify(o.payload, null, 1)}</pre>
                <div className="mt-1 text-xs text-mute">by {o.actor || "system"} · {new Date(o.created_at).toLocaleString()}{o.note ? ` · ${o.note}` : ""}</div>
              </div>
              {o.status === "pending" && (
                <div className="flex gap-2">
                  <Button className="px-3 py-1.5 text-xs" onClick={() => mark(o.id, true)}><IconCheck width={13} height={13} /> Applied in SF</Button>
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => mark(o.id, false)}><IconX width={13} height={13} /> Skip</Button>
                </div>
              )}
              {o.status !== "pending" && <Pill tone={o.status === "done" ? "ok" : "mute"}>{o.status}</Pill>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
