"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Pill, Button, Input, Select, Empty, statusTone } from "@/components/ui";
import { IconSearch, IconPlus } from "@/components/icons";

type U = { id: string; email: string; display_name: string; role: string; phone: string; mfa_enabled: boolean; disabled: boolean; created_at: string; last_login_at: string; sf_contact_id: string | null; link_status: string | null };

export default function UsersPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [nf, setNf] = useState({ email: "", password: "", display_name: "", role: "advisor", phone: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback((s = "") =>
    fetch(`/api/admin/users${s ? `?search=${encodeURIComponent(s)}` : ""}`).then((r) => r.json()).then((d) => setUsers(d.users ?? [])), []);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>) {
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) setMsg(d.error); else setMsg("");
    load(search);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Staff & users" sub="Roles: advisor (review), manager (+merge), admin (everything)" 
        right={<Button onClick={() => setCreating(!creating)} className="px-3 py-2 text-xs"><IconPlus width={14} height={14} /> New staff</Button>} />
      {msg && <Card className="border-accent/40 p-3 text-sm text-accent">{msg}</Card>}

      {creating && (
        <Card className="space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} />
            <Input placeholder="Temp password (8+ chars)" type="password" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} />
            <Input placeholder="Display name" value={nf.display_name} onChange={(e) => setNf({ ...nf, display_name: e.target.value })} />
            <Select value={nf.role} onChange={(e) => setNf({ ...nf, role: e.target.value })}>
              <option value="advisor">Advisor</option><option value="manager">Manager</option><option value="admin">Admin</option>
            </Select>
          </div>
          <Button onClick={() => act(nf).then(() => setCreating(false))}>Create staff account</Button>
        </Card>
      )}

      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" width={15} height={15} />
        <Input value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value); }} placeholder="Search users…" className="pl-9" />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-line text-left">
            {["User", "Role", "Linked SF record", "MFA", "Last login", "Actions"].map((h) => (
              <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-mute">{h}</th>))}
          </tr></thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} className={u.disabled ? "opacity-40" : ""}>
                <td className="px-4 py-3">
                  <div className="font-medium">{u.display_name || u.email}</div>
                  <div className="text-xs text-mute">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                </td>
                <td className="px-4 py-3">
                  <Select value={u.role} className="w-32 py-1.5 text-xs" onChange={(e) => act({ userId: u.id, role: e.target.value })}>
                    {["student", "advisor", "manager", "admin"].map((r) => <option key={r}>{r}</option>)}
                  </Select>
                </td>
                <td className="px-4 py-3">{u.sf_contact_id
                  ? <a href={`/admin/people/${u.sf_contact_id}`} className="text-xs underline underline-offset-4">{u.sf_contact_id}</a>
                  : <span className="text-xs text-mute">—</span>}</td>
                <td className="px-4 py-3"><Pill tone={u.mfa_enabled ? "ok" : "mute"}>{u.mfa_enabled ? "on" : "off"}</Pill></td>
                <td className="px-4 py-3 text-xs text-mute">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "never"}</td>
                <td className="px-4 py-3">
                  <Button variant="ghost" className={`px-2 py-1 text-xs ${u.disabled ? "" : "text-accent"}`}
                    onClick={() => act({ userId: u.id, disabled: !u.disabled })}>
                    {u.disabled ? "Enable" : "Disable"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <Empty title="No users" />}
      </Card>
    </div>
  );
}
