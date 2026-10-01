"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Pill, Empty, statusTone } from "@/components/ui";
import { IconCheck, IconUpload, IconClock } from "@/components/icons";

type Item = { id: string; key: string; label: string; required: boolean; status: string; note: string | null; docs: number };

export default function ChecklistPage() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => { fetch("/api/checklist").then((r) => r.json()).then((d) => setItems(d.items ?? [])); }, []);

  const done = items?.filter((i) => ["approved", "waived"].includes(i.status)).length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Checklist" sub={items ? `${done} of ${items.length} complete` : "Loading…"} />

      {items && !items.length && (
        <Empty title="No checklist yet" hint="Submit your application first — your requirements will appear here." />
      )}

      <div className="space-y-2.5">
        {items?.map((it, idx) => (
          <Card key={it.id} className="flex items-center gap-4 p-4">
            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${["approved","waived"].includes(it.status) ? "border-ink bg-ink text-white" : "border-line text-mute"}`}>
              {["approved","waived"].includes(it.status) ? <IconCheck width={15} height={15} />
                : it.status === "submitted" ? <IconClock width={15} height={15} />
                : <span className="text-xs font-semibold">{idx + 1}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{it.label}</span>
                {it.required && <span className="text-[10px] font-semibold text-accent">REQ</span>}
              </div>
              {it.note && <div className="mt-0.5 text-xs text-accent">Note from advisor: {it.note}</div>}
              {it.docs > 0 && <div className="mt-0.5 text-xs text-mute">{it.docs} file{it.docs === 1 ? "" : "s"} attached</div>}
            </div>
            <div className="flex items-center gap-2">
              <Pill tone={statusTone(it.status)}>{it.status.replace(/_/g, " ")}</Pill>
              {!["approved", "waived"].includes(it.status) && (
                <Link href={`/portal/documents?item=${it.id}`}
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
