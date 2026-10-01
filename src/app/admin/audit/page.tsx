"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Pill, Input, Select, Empty, Spinner } from "@/components/ui";
import { IconSearch, IconArrowL, IconArrowR } from "@/components/icons";

export default function AuditPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");

  const load = useCallback((pg = 1, s = search, k = kind) => {
    const sp = new URLSearchParams({ page: String(pg), ...(s && { search: s }), ...(k && { kind: k }) });
    fetch(`/api/admin/audit?${sp}`).then((r) => r.json()).then((d) => { setRows(d.rows); setTotal(d.total); });
  }, [search, kind]);
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => { const t = setTimeout(() => { setPage(1); load(1); }, 350); return () => clearTimeout(t); }, [search, kind]); // eslint-disable-line

  const pages = Math.max(Math.ceil(total / 50), 1);

  return (
    <div className="space-y-4">
      <PageHeader title="Audit trail" sub="Every tracked event — page views, clicks, logins, admin actions" />

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" width={15} height={15} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user, path, detail…" className="pl-9" />
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto">
          <option value="">All events</option>
          {["page_view", "click", "action", "admin_action", "login", "logout"].map((k) => <option key={k}>{k}</option>)}
        </Select>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-xs">
          <thead><tr className="border-b border-line text-left">
            {["Time", "User", "Event", "Path / detail", "IP"].map((h) => (
              <th key={h} className="px-4 py-3 font-semibold uppercase tracking-wide text-mute">{h}</th>))}
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2.5 text-mute">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium">{r.email || "anonymous"}</div>
                  {r.role && <div className="text-[10px] uppercase text-mute">{r.role}</div>}
                </td>
                <td className="px-4 py-2.5"><Pill tone={r.kind === "admin_action" ? "warn" : "mute"}>{r.kind.replace(/_/g, " ")}</Pill></td>
                <td className="max-w-96 truncate px-4 py-2.5 text-mute">
                  {r.path || ""}{Object.keys(r.detail || {}).length ? ` · ${JSON.stringify(r.detail).slice(0, 120)}` : ""}
                  {r.duration_ms ? ` · ${Math.round(r.duration_ms / 1000)}s` : ""}
                </td>
                <td className="px-4 py-2.5 text-mute">{r.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length && <Empty title="No events match" />}
        {!rows && <div className="p-8 text-center"><Spinner /></div>}
      </Card>

      <div className="flex items-center justify-center gap-3">
        <button onClick={() => { setPage(page - 1); load(page - 1); }} disabled={page <= 1}
          className="grid h-9 w-9 place-items-center rounded-md border border-line disabled:opacity-30"><IconArrowL width={15} height={15} /></button>
        <span className="text-sm text-mute">{page} / {pages} · {total.toLocaleString()} events</span>
        <button onClick={() => { setPage(page + 1); load(page + 1); }} disabled={page >= pages}
          className="grid h-9 w-9 place-items-center rounded-md border border-line disabled:opacity-30"><IconArrowR width={15} height={15} /></button>
      </div>
    </div>
  );
}
