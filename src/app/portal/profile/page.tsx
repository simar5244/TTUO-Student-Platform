"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Card, Field, Input, Button, Pill, Spinner } from "@/components/ui";
import { IconShield } from "@/components/icons";

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Record<string, any> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [mfaStep, setMfaStep] = useState<{ challengeId: string; devCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((d) => {
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

  async function changePassword() {
    setBusy(true); setPwMsg("");
    const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change_password", current: pwCur, next: pwNew }) });
    const d = await r.json().catch(() => null);
    setBusy(false);
    setPwMsg(r.ok ? "Password updated." : d?.error || "Couldn't update — try again.");
    if (r.ok) { setPwCur(""); setPwNew(""); }
  }

  async function deleteAccount() {
    setBusy(true);
    const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_account", confirm: true }) });
    setBusy(false);
    if (r.ok) { router.push("/signup"); router.refresh(); }
    else setMsg("Couldn't delete your account — try again or message an advisor.");
  }

  if (!me) return null;

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

      <Card className="space-y-4 p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-mute">Change password</div>
        <Field label="Current password"><Input type="password" autoComplete="current-password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} /></Field>
        <Field label="New password"><Input type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} /></Field>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={changePassword} disabled={busy || !pwCur || !pwNew}>{busy ? <Spinner /> : "Update password"}</Button>
          {pwMsg && <span className="text-sm text-mute">{pwMsg}</span>}
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-mute">Account</div>
        {!confirmDelete ? (
          <div className="mt-3">
            <Button variant="outline" className="border-accent text-accent hover:bg-accent/5" onClick={() => setConfirmDelete(true)}>
              Delete my account
            </Button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm">Permanently delete your portal account and uploaded documents? This can't be undone — it does not affect your official Texas Tech record.</p>
            <div className="flex gap-2">
              <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={busy} onClick={deleteAccount}>
                {busy ? <Spinner /> : "Yes, delete everything"}
              </Button>
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
