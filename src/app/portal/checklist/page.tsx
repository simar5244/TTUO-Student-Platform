"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Pill, Empty, statusTone } from "@/components/ui";
import { IconCheck, IconUpload, IconClock } from "@/components/icons";

type Item = {
  id: string; key: string | null; label: string; required: boolean; status: string;
  note: string | null; docs: number; sf?: boolean; sf_status?: string | null;
  description?: string | null;
};
type Resp = { items: Item[]; source?: "sf" | "local" | "none"; pending?: string | null };

const DONE = ["approved", "waived"];

export default function ChecklistPage() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => { fetch("/api/checklist").then((r) => r.json()).then((d) => setData({ items: d.items ?? [], source: d.source, pending: d.pending })); }, []);

  const items = data?.items;
  const done = items?.filter((i) => DONE.includes(i.status)).length ?? 0;
  const display = (s: string) => s === "pushed" ? "in Salesforce" : s.replace(/_/g, " ");

  return (
    <div className="space-y-5">
      <PageHeader title="Checklist"
        sub={items?.length ? `${done} of ${items.length} complete${data?.source === "sf" ? " — synced from Texas Tech" : ""}` : "Loading…"} />

      {items && !items.length && (
        data?.pending
          ? <Empty title="Requirements coming soon" hint={data.pending} />
          : <Empty title="No checklist yet" hint="Submit your application on RaiderConnect — your requirements will appear here." />
      )}

      <div className="space-y-2.5">
        {items?.map((it, idx) => (
          <Card key={it.id} className="flex items-center gap-4 p-4">
            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${DONE.includes(it.status) ? "border-ink bg-ink text-white" : "border-line text-mute"}`}>
              {DONE.includes(it.status) ? <IconCheck width={15} height={15} />
                : ["submitted", "pushed"].includes(it.status) ? <IconClock width={15} height={15} />
                : <span className="text-xs font-semibold">{idx + 1}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{it.label}</span>
                {it.required && <span className="text-[10px] font-semibold text-accent">REQ</span>}
              </div>
              {it.note && <div className="mt-0.5 text-xs text-accent">Note from advisor: {it.note}</div>}
              {it.sf && it.sf_status && !DONE.includes(it.status) && (
                <div className="mt-0.5 text-xs text-mute">Texas Tech: {it.sf_status}</div>
              )}
              {it.status === "pushed" && <div className="mt-0.5 text-xs text-mute">Uploaded to Salesforce — waiting for confirmation</div>}
              {it.status === "submitted" && it.sf && <div className="mt-0.5 text-xs text-mute">Received — pending advisor review</div>}
              {it.docs > 0 && <div className="mt-0.5 text-xs text-mute">{it.docs} file{it.docs === 1 ? "" : "s"} attached</div>}
            </div>
            <div className="flex items-center gap-2">
              <Pill tone={statusTone(it.status)}>{display(it.status)}</Pill>
              {!DONE.includes(it.status) && (
                <Link href={it.sf ? `/portal/documents?sf_item=${it.id}&req=${encodeURIComponent(it.key ?? "")}` : `/portal/documents?item=${it.id}`}
                  className="grid h-9 w-9 place-items-center rounded-md border border-line hover:border-ink" aria-label="Upload">
                  <IconUpload width={15} height={15} />
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
