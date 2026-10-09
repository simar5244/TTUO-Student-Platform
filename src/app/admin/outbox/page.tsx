"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Pill, Button, Select, Empty } from "@/components/ui";
import { IconCheck, IconX, IconDoc, IconMerge, IconUser } from "@/components/icons";

type Item = {
  id: string; entity_type: string; entity_id: string; action: string; payload: any;
  status: string; actor: string; created_at: string; note: string;
  student_name: string | null; student_email: string | null;
  contact_name: string | null; contact_email: string | null;
  doc_filename: string | null; doc_owner_name: string | null; doc_owner_email: string | null;
};

// Turn an outbox row into plain language + the steps to do in Salesforce.
function describe(o: Item): { icon: any; title: string; steps: string[] } {
  const student = o.student_name || o.student_email;
  const contact = o.contact_name || o.contact_email || o.entity_id;
  switch (o.action) {
    case "manual_merge_review":
      return {
        icon: IconMerge,
        title: `Link ${student ?? "a portal account"} to a Salesforce record`,
        steps: [
          `Find ${contact} in RaiderConnect / Salesforce.`,
          `If a duplicate contact exists for ${o.student_email ?? "the student"}, merge them in Salesforce.`,
          "No other action needed — the portal side is already linked.",
        ],
      };
    case "verify_portal_link":
      return {
        icon: IconMerge,
        title: `Double-check the link for ${student ?? "a portal account"}`,
        steps: [
          `Confirm ${o.student_email ?? "the portal account"} and ${contact} are the same person.`,
          "If they aren't, unlink them on the ID Links page instead of marking this done.",
        ],
      };
    case "sf_upload_done":
      return {
        icon: IconDoc,
        title: `Attach "${o.doc_filename ?? "a document"}" in RaiderConnect`,
        steps: [
          `Upload the file to ${o.doc_owner_name || o.doc_owner_email || "the student"}'s application in RaiderConnect.`,
          "Mark the matching checklist item received there.",
        ],
      };
    default:
      return {
        icon: IconDoc,
        title: `Update ${o.entity_type} in Salesforce`,
        steps: [
          o.payload?.value ? `Set ${o.action.replace(/_/g, " ")} → ${o.payload.value}` : `Action: ${o.action.replace(/_/g, " ")}`,
          `Record: ${o.contact_name || o.entity_id}`,
        ],
      };
  }
}

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

  const pending = items.filter((i) => i.status === "pending").length;

  return (
    <div className="space-y-4">
      <PageHeader title="To-do in Salesforce" sub={`${pending} waiting — do each task in RaiderConnect/Salesforce, then mark it done here.`}
        right={<Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="pending">To do</option><option value="done">Done</option><option value="skipped">Skipped</option><option value="all">All</option>
        </Select>} />

      {!items.length && <Empty title="Nothing to do" hint="When staff link accounts or push documents, the Salesforce follow-up lands here." />}

      <div className="space-y-2.5">
        {items.map((o) => {
          const d = describe(o);
          return (
            <Card key={o.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-smoke"><d.icon width={15} height={15} /></span>
                    <span className="text-sm font-semibold">{d.title}</span>
                  </div>
                  <ol className="mt-2 list-decimal space-y-0.5 pl-9 text-xs text-mute">
                    {d.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  {o.note && <div className="mt-1.5 pl-9 text-xs text-mute">Note: {o.note}</div>}
                  <details className="mt-1.5 pl-9 text-xs text-mute">
                    <summary className="cursor-pointer select-none">Technical details</summary>
                    <div className="mt-1 break-all font-mono">{o.entity_type} · {o.entity_id} · {o.action}</div>
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-smoke p-2">{JSON.stringify(o.payload, null, 1)}</pre>
                  </details>
                  <div className="mt-1.5 pl-9 text-xs text-mute">queued by {o.actor || "system"} · {new Date(o.created_at).toLocaleString()}</div>
                </div>
                {o.status === "pending" && (
                  <div className="flex gap-2">
                    <Button className="px-3 py-1.5 text-xs" onClick={() => mark(o.id, true)}><IconCheck width={13} height={13} /> Done</Button>
                    <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => mark(o.id, false)}><IconX width={13} height={13} /> Skip</Button>
                  </div>
                )}
                {o.status !== "pending" && <Pill tone={o.status === "done" ? "ok" : "mute"}>{o.status}</Pill>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
