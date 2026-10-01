"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, Input, Spinner } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState<null | { matched: boolean; type?: string }>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/signup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Signup failed");
    if (d.match?.matched) setMatched(d.match);
    else { router.push("/portal"); router.refresh(); }
  }

  if (matched) {
    return (
      <AuthShell title="We found your record">
        <div className="rounded-lg border border-line p-5 text-sm leading-relaxed">
          {matched.type === "auto_full"
            ? "Your email and phone match a record we already have — we've linked it to your account automatically."
            : "We found a record that partially matches you. An advisor will verify the link shortly."}
        </div>
        <Button className="mt-5 w-full" onClick={() => { router.push("/portal"); router.refresh(); }}>Continue to portal</Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" sub="Use the same email and phone you gave us — we'll link your records automatically."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-ink underline underline-offset-4">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><Input required value={f.name} onChange={set("name")} autoComplete="name" /></Field>
        <Field label="Email"><Input type="email" required value={f.email} onChange={set("email")} autoComplete="email" /></Field>
        <Field label="Mobile phone" hint="Used for verification codes (SMS)">
          <Input type="tel" required value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder="(806) 555-0123" />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input type="password" required minLength={8} value={f.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        {err && <p className="text-sm text-accent">{err}</p>}
        <Button className="w-full" disabled={busy}>{busy ? <Spinner /> : "Create account"}</Button>
        <p className="text-xs leading-relaxed text-mute">
          By creating an account you agree to receive SMS messages related to your application. Msg & data rates may apply.
        </p>
      </form>
    </AuthShell>
  );
}
