"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, Card, Pill, Empty, Button, statusTone, Spinner } from "@/components/ui";
import { Dropdown } from "@/components/Dropdown";
import { IconDoc, IconUpload, IconDownload } from "@/components/icons";

type Doc = { id: string; filename: string; mime: string; size: number; status: string; note: string | null; uploaded_at: string; item_label: string | null };
type Item = { id: string; label: string; status: string };

function Documents() {
  const params = useSearchParams();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [item, setItem] = useState(params.get("item") || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => fetch("/api/documents").then((r) => r.json()).then((d) => setDocs(d.documents ?? []));
  useEffect(() => {
    load();
    fetch("/api/checklist").then((r) => r.json()).then((d) => setItems((d.items ?? []).filter((i: Item) => !["approved","waived"].includes(i.status))));
  }, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr("");
    const fd = new FormData();
    fd.append("file", file);
    if (item) fd.append("item", item);
    const r = await fetch("/api/documents", { method: "POST", body: fd });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Upload failed");
    if (fileRef.current) fileRef.current.value = "";
    load();
  }

  const fmt = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

  return (
    <div className="space-y-5">
      <PageHeader title="Documents" sub="PDF, JPG, PNG or DOCX · 15MB max" />

      <Card className="space-y-3 p-4">
        <Field2 label="Attach to requirement (optional)">
          <Dropdown value={item} onChange={setItem} placeholder="General document"
            options={[{ value: "", label: "General document" }, ...items.map((i) => ({ value: i.id, label: i.label }))]} />
        </Field2>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" className="hidden" onChange={upload} />
        <Button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full sm:w-auto">
          {busy ? <Spinner /> : <><IconUpload width={15} height={15} /> Choose file</>}
        </Button>
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
            <Pill tone={statusTone(d.status)}>{d.status}</Pill>
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
