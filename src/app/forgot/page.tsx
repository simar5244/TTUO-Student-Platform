"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, Input, Spinner } from "@/components/ui";

export default function ForgotPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [step, setStep] = useState<{ challengeId: string; userId: string; devCode?: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/forgot", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.challengeId) setStep(d);
    else setErr("If that account exists, a code was sent to the phone on file.");
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/reset", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: step!.challengeId, code, password: pw }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Reset failed");
    router.push("/login");
  }

  return (
    <AuthShell title="Reset password" sub="We'll text a verification code to the phone on your account."
      footer={<Link href="/login" className="font-medium text-ink underline underline-offset-4">Back to sign in</Link>}>
      {!step ? (
        <form onSubmit={send} className="space-y-4">
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {err && <p className="text-sm text-mute">{err}</p>}
          <Button className="w-full" disabled={busy}>{busy ? <Spinner /> : "Text me a code"}</Button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4">
          <Field label="Code from SMS" hint={step.devCode ? `dev code: ${step.devCode}` : undefined}>
            <Input inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="New password"><Input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          {err && <p className="text-sm text-accent">{err}</p>}
          <Button className="w-full" disabled={busy}>{busy ? <Spinner /> : "Set new password"}</Button>
        </form>
      )}
    </AuthShell>
  );
}
