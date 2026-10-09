"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, Input, Spinner } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) return setErr("Please agree to the Terms & Conditions to create your account.");
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, agreed: true }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Signup failed");
    router.push("/portal"); router.refresh();
  }

  return (
    <AuthShell title="Create your account" sub="One account to apply, upload documents, and track your application."
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

        <label className="flex items-start gap-2.5 rounded-lg border border-line p-3 text-xs leading-relaxed text-mute">
          <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#111]"
            checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            By creating an account I agree to the{" "}
            <Link href="/terms" className="font-medium text-ink underline underline-offset-2" target="_blank">
              Terms &amp; Conditions and Privacy Notice
            </Link>
            , and consent to receive SMS verification codes (msg &amp; data rates may apply).
          </span>
        </label>

        {err && <p className="text-sm text-accent">{err}</p>}
        <Button className="w-full" disabled={busy}>{busy ? <Spinner /> : "Create account"}</Button>
      </form>
    </AuthShell>
  );
}
