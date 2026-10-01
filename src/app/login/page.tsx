"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, Input, Spinner } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfa, setMfa] = useState<{ challengeId: string; userId: string; devCode?: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Login failed");
    if (d.mfa) return setMfa(d);
    router.push(params.get("next") || "/portal");
    router.refresh();
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/mfa", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: mfa!.challengeId, code, userId: mfa!.userId }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Verification failed");
    router.push(params.get("next") || "/portal");
    router.refresh();
  }

  if (mfa) {
    return (
      <form onSubmit={verify} className="space-y-4">
        <Field label="Verification code" hint={`Sent via SMS to your phone on file${mfa.devCode ? ` · dev code: ${mfa.devCode}` : ""}`}>
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
            value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        </Field>
        {err && <p className="text-sm text-accent">{err}</p>}
        <Button className="w-full" disabled={busy || code.length < 4}>
          {busy ? <Spinner /> : "Verify & sign in"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {err && <p className="text-sm text-accent">{err}</p>}
      <Button className="w-full" disabled={busy}>{busy ? <Spinner /> : "Sign in"}</Button>
      <div className="text-right">
        <Link href="/forgot" className="text-xs font-medium text-mute hover:text-ink">Forgot password?</Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" sub="Sign in to your applicant portal"
      footer={<>New here? <Link href="/signup" className="font-medium text-ink underline underline-offset-4">Create an account</Link></>}>
      <Suspense><LoginForm /></Suspense>
    </AuthShell>
  );
}
