"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Card, Field, Button, Pill, Spinner, statusTone } from "@/components/ui";
import { Dropdown } from "@/components/Dropdown";
import { Loading } from "@/components/Loading";

type Meta = { terms: { id: string; name: string }[]; programs: { id: string; name: string; degree: string; college: string }[]; studentTypes: string[] };

export default function ApplyPage() {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [existing, setExisting] = useState<Record<string, string> | null>(null);
  const [f, setF] = useState({ program_id: "", term_id: "", student_type: "", about: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/meta").then((r) => r.json()).then(setMeta);
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (d.portalApplication) {
        setExisting(d.portalApplication);
        setF({
          program_id: d.portalApplication.program_id || "",
          term_id: d.portalApplication.term_id || "",
          student_type: d.portalApplication.student_type || "",
          about: d.portalApplication.answers?.about || "",
        });
      }
    });
  }, []);

  if (!meta) return <Loading label="Loading programs" />;

  const program = meta?.programs.find((p) => p.id === f.program_id);
  const term = meta?.terms.find((t) => t.id === f.term_id);
  const locked = !!(existing && existing.status !== "draft");

  async function save(submit: boolean) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/applications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        program_id: f.program_id, program_name: program?.name, degree: program?.degree,
        term_id: f.term_id, term: term?.name, student_type: f.student_type,
        answers: { about: f.about }, submit,
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(d.error || "Something went wrong");
    if (submit) { router.push("/portal/checklist"); router.refresh(); }
    else setMsg("Draft saved.");
  }

  return (
    <div className="space-y-5">
      <PageHeader title={locked ? "Your application" : "Application"} sub={locked ? "Submitted — contact an advisor for changes." : "Pick your program and term. You can save a draft and come back."} />

      {locked && (
        <Card className="flex items-center justify-between p-4">
          <div className="text-sm font-medium">Status</div>
          <Pill tone={statusTone(existing!.status)}>{existing!.status}</Pill>
        </Card>
      )}

      <Card className="space-y-4 p-5">
        <Field label="Program">
          <Dropdown value={f.program_id} disabled={locked || !meta} searchable placeholder="Select a program…"
            options={(meta?.programs ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.degree})`, sub: p.college }))}
            onChange={(v) => setF({ ...f, program_id: v })} />
        </Field>
        <Field label="Start term">
          <Dropdown value={f.term_id} disabled={locked || !meta} placeholder="Select a term…"
            options={(meta?.terms ?? []).map((t) => ({ value: t.id, label: t.name }))}
            onChange={(v) => setF({ ...f, term_id: v })} />
        </Field>
        <Field label="Student type">
          <Dropdown value={f.student_type} disabled={locked || !meta} placeholder="Select…"
            options={(meta?.studentTypes.length ? meta.studentTypes : ["New First Time", "Transfer", "Graduate", "Returning"]).map((s) => ({ value: s, label: s }))}
            onChange={(v) => setF({ ...f, student_type: v })} />
        </Field>
        <Field label="Anything we should know?" hint="Optional — goals, questions, transfer credits">
          <textarea value={f.about} disabled={locked} onChange={(e) => setF({ ...f, about: e.target.value })}
            rows={4} className="w-full rounded-md border border-line px-3.5 py-2.5 text-sm outline-none focus:border-ink disabled:bg-smoke" />
        </Field>
        {msg && <p className="text-sm text-mute">{msg}</p>}
        {!locked && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save(false)} disabled={busy}>Save draft</Button>
            <Button onClick={() => save(true)} disabled={busy || !f.program_id || !f.term_id}>
              {busy ? <Spinner /> : "Submit application"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
