"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Pill, Empty, Input, Select, Spinner, cn } from "@/components/ui";
import { IconSearch, IconArrowL, IconArrowR } from "@/components/icons";

const fmtDur = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

function UsageTab() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/admin/analytics").then((r) => r.json()).then(setD); }, []);
  if (!d) return <div className="py-20 text-center"><Spinner /></div>;

  const maxDay = Math.max(...d.daily.map((x: any) => x.events), 1);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold">Daily events</h3>
        {!d.daily.length && <Empty title="No data yet" />}
        <div className="flex h-32 items-end gap-1.5">
          {d.daily.slice().reverse().map((x: any) => (
            <div key={x.day} className="group relative flex-1">
              <div className="w-full rounded-t bg-ink transition-all group-hover:bg-accent" style={{ height: `${(x.events / maxDay) * 100}%` }} />
              <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100">
                {x.day}: {x.events} events · {x.users} users
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-mute">Top pages</div>
          <div className="divide-y divide-line">
            {d.byPage.map((p: any) => (
              <div key={p.path} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="truncate font-mono text-xs">{p.path}</span>
                <span className="shrink-0 text-xs text-mute">{p.views} views · {fmtDur(p.total_ms)}</span>
              </div>
            ))}
            {!d.byPage.length && <div className="px-5 py-6 text-sm text-mute">No page views yet.</div>}
          </div>
        </Card>

        <Card>
          <div className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-mute">Time by user</div>
          <div className="divide-y divide-line">
            {d.byUser.map((u: any) => (
              <div key={u.email} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{u.display_name || u.email}</div>
                  <div className="text-xs text-mute">{u.views} page views · last {new Date(u.last_seen).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone="mute">{u.role}</Pill>
                  <span className="text-xs font-medium tabular-nums">{fmtDur(u.total_ms)}</span>
                </div>
              </div>
            ))}
            {!d.byUser.length && <div className="px-5 py-6 text-sm text-mute">No user activity yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AuditTab() {
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

export default function AnalyticsPage() {
  const [tab, setTab] = useState<"usage" | "audit">("usage");
  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" sub="Portal usage and the full audit trail" />
      <div className="flex gap-1 border-b border-line">
        {([["usage", "Usage"], ["audit", "Audit trail"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn("px-4 py-2 text-sm font-medium -mb-px border-b-2",
              tab === k ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>
      {tab === "usage" ? <UsageTab /> : <AuditTab />}
      <div className="flex gap-4 border-t border-line pt-3 text-xs text-mute">
        <a href="/admin/outbox" className="underline underline-offset-2 hover:text-ink">Salesforce to-do (outbox)</a>
        <a href="/admin/sync" className="underline underline-offset-2 hover:text-ink">Data sync</a>
      </div>
    </div>
  );
}
