"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, Card, Pill, Empty, Button, statusTone, Spinner } from "@/components/ui";
import { Dropdown } from "@/components/Dropdown";
import { IconDoc, IconUpload, IconDownload } from "@/components/icons";

type Doc = { id: string; filename: string; mime: string; size: number; status: string; note: string | null; uploaded_at: string; item_label: string | null; req_key: string | null };
type Item = { id: string; key: string | null; label: string; status: string; sf?: boolean };

const STATUS_TEXT: Record<string, string> = {
  pending_review: "pending review",
  pushed: "sent to TTU",
  approved: "received by TTU",
  rejected: "needs attention",
};

function Documents() {
  const params = useSearchParams();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  // selection: "local:<uuid>" | "sf:<id>:<req>" | ""
  const [sel, setSel] = useState(
    params.get("sf_item") ? `sf:${params.get("sf_item")}:${params.get("req") ?? ""}`
    : params.get("item") ? `local:${params.get("item")}` : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => fetch("/api/documents", { cache: "no-store" }).then((r) => r.json()).then((d) => setDocs(d.documents ?? []));
  useEffect(() => {
    load();
    fetch("/api/checklist", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setItems((d.items ?? []).filter((i: Item) => !["approved", "waived"].includes(i.status))));
  }, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (sel.startsWith("local:")) fd.append("item", sel.slice(6));
      else if (sel.startsWith("sf:")) {
        const [, id, req] = sel.split(":");
        fd.append("sf_item", id);
        if (req) fd.append("req_key", req);
      }
      const r = await fetch("/api/documents", { method: "POST", body: fd });
      // nginx/proxy errors come back as HTML, not JSON — don't let that throw
      const d = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok) {
        setErr(d.error || (r.status === 413 ? "File too large — keep it under 15MB" : `Upload failed (${r.status})`));
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch {
      setErr("Upload failed — check your connection and try again");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const fmt = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

  return (
    <div className="space-y-5">
      <PageHeader title="Documents" sub="PDF, JPG, PNG or DOCX · 15MB max · uploads are reviewed by an advisor, then sent to Texas Tech" />

      <Card className="space-y-3 p-4">
        <Field2 label="Attach to requirement (optional)">
          <Dropdown value={sel} onChange={setSel} placeholder="General document"
            options={[{ value: "", label: "General document" },
              ...items.map((i) => ({ value: i.sf ? `sf:${i.id}:${i.key ?? ""}` : `local:${i.id}`, label: i.label }))]} />
        </Field2>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" className="hidden" onChange={upload} />
        <Button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full sm:w-auto">
          {busy ? <Spinner /> : <><IconUpload width={15} height={15} /> Choose file</>}
        </Button>
        <p className="text-xs text-mute">Documents you already submitted on RaiderConnect show up on your checklist automatically.</p>
        {err && <p className="text-sm text-accent">{err}</p>}
      </Card>

      {docs && !docs.length && <Empty title="Nothing uploaded yet" hint="Upload transcripts, ID, resume — anything your checklist needs." />}

      <div className="space-y-2.5">
        {docs?.map((d) => (
          <Card key={d.id} className="flex items-center gap-4 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-smoke"><IconDoc width={17} height={17} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{d.filename}</div>
              <div className="text-xs text-mute">
                {fmt(d.size)} · {new Date(d.uploaded_at).toLocaleDateString()}{d.item_label ? ` · ${d.item_label}` : ""}
              </div>
              {d.note && <div className="mt-0.5 text-xs text-accent">{d.note}</div>}
            </div>
            <Pill tone={statusTone(d.status)}>{STATUS_TEXT[d.status] ?? d.status}</Pill>
            <a href={`/api/files/${d.id}`} target="_blank" className="grid h-9 w-9 place-items-center rounded-md border border-line hover:border-ink" aria-label="Open">
              <IconDownload width={15} height={15} />
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Field2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">{label}</span>
      {children}
    </label>
  );
}

export default function Page() { return <Suspense><Documents /></Suspense>; }
