"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Field, Input, Button, Pill, Spinner } from "@/components/ui";
import { IconShield } from "@/components/icons";

export default function ProfilePage() {
  const [me, setMe] = useState<Record<string, any> | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [mfaStep, setMfaStep] = useState<{ challengeId: string; devCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/me").then((r) => r.json()).then((d) => {
    setMe(d); setName(d.user.name || ""); setPhone(d.user.phone || "");
  });
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setMsg("");
    await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name: name, phone }) });
    setBusy(false); setMsg("Saved."); load();
  }

  async function mfaStart() {
    setBusy(true);
    const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mfa_start", phone }) });
    const d = await r.json();
    setBusy(false);
    if (d.challengeId) setMfaStep(d);
  }
  async function mfaConfirm() {
    setBusy(true);
    await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mfa_confirm", challengeId: mfaStep!.challengeId, code, phone }) });
    setBusy(false); setMfaStep(null); setCode(""); load();
  }
  async function mfaOff() {
    await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mfa_off" }) });
    load();
  }

  if (!me) return null;
  const linked = me.link?.sf_contact_id;

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" sub="Your account and security settings" />

      <Card className="space-y-4 p-5">
        <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><Input value={me.user.email} disabled className="bg-smoke" /></Field>
        <Field label="Mobile phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={save} disabled={busy}>{busy ? <Spinner /> : "Save"}</Button>
          {msg && <span className="text-sm text-mute">{msg}</span>}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconShield width={20} height={20} />
            <div>
              <div className="text-sm font-medium">Two-factor authentication</div>
              <div className="text-xs text-mute">SMS code required at sign-in (Twilio)</div>
            </div>
          </div>
          {me.user.mfa
            ? <Button variant="ghost" onClick={mfaOff} className="text-accent">Turn off</Button>
            : <Button variant="outline" onClick={mfaStart} disabled={busy || !phone}>Enable</Button>}
        </div>
        {me.user.mfa && <Pill tone="ok">enabled</Pill>}
        {mfaStep && (
          <div className="mt-4 flex items-end gap-2 border-t border-line pt-4">
            <Field label={`Code sent to phone${mfaStep.devCode ? ` (dev: ${mfaStep.devCode})` : ""}`}>
              <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Button onClick={mfaConfirm} disabled={busy || code.length < 4}>Verify</Button>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-mute">University record</div>
        {linked ? (
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-mute">Name on file</span><span className="font-medium">{me.contact?.Name}</span></div>
            <div className="flex justify-between"><span className="text-mute">Status</span><span>{me.contact?.status || "—"}</span></div>
            <div className="flex justify-between"><span className="text-mute">Link status</span>
              <Pill tone={me.link.status === "pending_review" ? "warn" : "ok"}>{me.link.status.replace(/_/g, " ")}</Pill></div>
            <div className="flex justify-between"><span className="text-mute">Matched on</span>
              <span className="text-xs">{Object.keys(me.link.match_fields || {}).filter((k) => me.link.match_fields[k]).join(" + ") || "—"}</span></div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-mute">No university record linked yet. If you previously submitted an RFI with a different email/phone, an advisor can link it manually.</p>
        )}
      </Card>
    </div>
  );
}
