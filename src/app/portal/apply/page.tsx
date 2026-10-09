"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader, Card, Field, Button, Pill, Spinner, statusTone } from "@/components/ui";
import { Dropdown } from "@/components/Dropdown";
import { Loading } from "@/components/Loading";

type Meta = {
  terms: { id: string; name: string }[];
  rcPrograms: { label: string; modality: string; level: string; degree: string | null; sort: number }[];
};
type PortalApp = {
  id: string; status: string; rc_program: string | null; modality: string | null;
  term: string | null; term_id: string | null; sf_application_id: string | null;
};

// Applying happens on RaiderConnect (the official TTU Online form — Salesforce
// blocks framing it, so we hand off in the same tab and detect the application
// when it lands). This page = pick program/term, jump over, then watch for the
// app to appear on the student's linked contact.
export default function ApplyPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [app, setApp] = useState<PortalApp | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [f, setF] = useState({ program: "", modality: "8-week", term_id: "" });
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadMe() {
    const d = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json());
    setLinked(!!d.link?.sf_contact_id);
    if (d.portalApplication) {
      setApp(d.portalApplication);
      if (d.portalApplication.rc_program && !f.program)
        setF((p) => ({ ...p, program: d.portalApplication.rc_program, modality: d.portalApplication.modality || "8-week", term_id: d.portalApplication.term_id || "" }));
    }
  }
  useEffect(() => {
    fetch("/api/meta", { cache: "no-store" }).then((r) => r.json()).then(setMeta);
    loadMe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitted = !!app && !!app.sf_application_id;
  const waiting = !!app && !submitted && ["rc_started", "draft"].includes(app.status);

  // auto-check every 30s while waiting + whenever the tab refocuses
  async function detect(quiet = false) {
    if (!quiet) setChecking(true);
    try {
      const d = await fetch("/api/applications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect" }),
      }).then((r) => r.json());
      if (d.detected) {
        setMsg("");
        loadMe();
        if (poll.current) { clearInterval(poll.current); poll.current = null; }
      } else if (!quiet) {
        setMsg("Not seeing it yet — Salesforce can take a few minutes. Try again in a bit.");
      }
    } finally { setChecking(false); }
  }
  useEffect(() => {
    if (!waiting) return;
    const onFocus = () => detect(true);
    window.addEventListener("focus", onFocus);
    poll.current = setInterval(() => detect(true), 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (poll.current) clearInterval(poll.current);
    };
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!meta) return <Loading label="Loading programs" />;

  const programs = meta.rcPrograms.filter((p) => p.modality === f.modality);
  const term = meta.terms.find((t) => t.id === f.term_id);

  async function go() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/applications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "intent", program_label: f.program, modality: f.modality, term: term?.name, term_id: f.term_id || null }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(d.error || "Something went wrong");
    setApp({ ...(app as PortalApp), status: "rc_started", rc_program: f.program, modality: f.modality, term: term?.name ?? null, term_id: f.term_id, sf_application_id: null, id: d.id });
    window.location.assign(d.rcUrl); // same tab — it should feel like one flow
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Apply" sub="Applications are completed on RaiderConnect — Texas Tech's official application system." />

      {submitted && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Application found</div>
            <Pill tone={statusTone("approved")}>in Salesforce</Pill>
          </div>
          <p className="text-sm text-mute">
            {app!.rc_program ? `${app!.rc_program} · ` : ""}{app!.term ?? ""}
          </p>
          <p className="text-sm text-mute">Your checklist now tracks what Texas Tech has received. Uploads still needed show as open items.</p>
          <Button onClick={() => window.location.assign("/portal/checklist")}>View my checklist</Button>
        </Card>
      )}

      {waiting && !submitted && (
        <Card className="space-y-3 p-5 border-2 border-ink">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Finish on RaiderConnect</div>
            <Pill>in progress</Pill>
          </div>
          <p className="text-sm text-mute">
            {app!.rc_program ? `${app!.rc_program}` : "Your application"}{app!.term ? ` · ${app!.term}` : ""}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-mute">
            <li>Sign in (or create your RaiderConnect account)</li>
            <li>Choose <b className="text-ink">Undergraduate</b> → <b className="text-ink">Fully Online</b> → <b className="text-ink">{app!.modality ?? "8-week"}</b></li>
            <li>Pick <b className="text-ink">{app!.rc_program ?? "your program"}</b> and complete the form</li>
            <li>Come back here — we'll pick up your application automatically</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => window.location.assign("https://texastech.my.site.com/online/TX_SiteLogin?startURL=%2Fonline%2FTargetX_App__NewApplication")}>
              Open RaiderConnect
            </Button>
            <Button variant="outline" onClick={() => detect()} disabled={checking}>
              {checking ? <Spinner /> : "I've submitted — check now"}
            </Button>
          </div>
          {msg && <p className="text-sm text-mute">{msg}</p>}
        </Card>
      )}

      {linked === false && !waiting && !submitted && (
        <Card className="p-5 text-sm text-mute">
          Applied before? If your application doesn't show up here within a day, message an advisor and we'll get it attached to your account.
        </Card>
      )}

      {!submitted && (
        <Card className="space-y-4 p-5">
          <Field label="Modality">
            <div className="flex gap-2">
              {["8-week", "16-week"].map((m) => (
                <button key={m} type="button" onClick={() => setF({ ...f, modality: m, program: "" })}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${f.modality === m ? "border-ink bg-ink text-white" : "border-line"}`}>
                  {m} courses
                </button>
              ))}
            </div>
          </Field>
          <Field label="Program" hint={f.modality === "16-week" ? "Education is the only 16-week online program" : undefined}>
            <Dropdown value={f.program} searchable placeholder="Select a program…"
              options={programs.map((p) => ({ value: p.label, label: p.label }))}
              onChange={(v) => setF({ ...f, program: v })} />
          </Field>
          <Field label="Start term">
            <Dropdown value={f.term_id} placeholder="Select a term…"
              options={meta.terms.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(v) => setF({ ...f, term_id: v })} />
          </Field>
          <Button onClick={go} disabled={busy || !f.program}>
            {busy ? <Spinner /> : "Continue to RaiderConnect"}
          </Button>
        </Card>
      )}
    </div>
  );
}
