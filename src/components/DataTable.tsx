"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Input, Select, Pill, Spinner, statusTone, Empty } from "./ui";
import { IconSearch, IconArrowL, IconArrowR } from "./icons";

export interface Col {
  key: string; label: string;
  pill?: boolean;
  hideMobile?: boolean;
  render?: (row: Record<string, unknown>) => React.ReactNode;
}
export interface FilterDef { key: string; label: string; options: string[] | { id: string; name: string }[] }

export function DataTable({ endpoint, columns, filters, rowHref, metaUrl = "/api/meta" }: {
  endpoint: string;
  columns: Col[];
  filters: { def: FilterDef; metaKey?: string }[];
  rowHref?: (row: Record<string, unknown>) => string;
  metaUrl?: string;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState<Record<string, any[]>>({});
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { fetch(metaUrl).then((r) => r.json()).then(setMeta).catch(() => {}); }, [metaUrl]);

  const load = useCallback(async (pg: number, s: string, v: Record<string, string>) => {
    setBusy(true);
    const sp = new URLSearchParams({ page: String(pg), ...(s ? { search: s } : {}), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)) });
    const r = await fetch(`${endpoint}?${sp}`);
    const d = await r.json();
    setRows(d.rows ?? []); setTotal(d.total ?? 0); setBusy(false);
  }, [endpoint]);

  useEffect(() => { load(page, search, vals); }, [page, vals]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setPage(1); load(1, search, vals); }, 350);
    return () => clearTimeout(debounce.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const perPage = 25;
  const pages = Math.max(Math.ceil(total / perPage), 1);

  return (
    <div className="space-y-3">
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" width={15} height={15} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…" className="pl-9" />
        </div>
        {filters.map(({ def, metaKey }) => {
          const opts = metaKey ? (meta[metaKey] ?? []) : def.options;
          return (
            <Select key={def.key} value={vals[def.key] || ""} className="w-auto min-w-32"
              onChange={(e) => { setVals({ ...vals, [def.key]: e.target.value }); setPage(1); }}>
              <option value="">{def.label}</option>
              {opts.map((o: any) => <option key={o.id ?? o} value={o.name ?? o.id ?? o}>{o.name ?? o}</option>)}
            </Select>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-mute">
        <span>{total.toLocaleString()} result{total === 1 ? "" : "s"}</span>
        {busy && <Spinner />}
      </div>

      {/* cards on mobile, table on desktop */}
      <div className="space-y-2 sm:hidden">
        {rows?.map((r, i) => (
          <Card key={i} onClick={() => rowHref && router.push(rowHref(r))}
            className="block p-4" >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.student || r.Name || r.name || "—"}</div>
                <div className="truncate text-xs text-mute">{r.email || r.Email || r.app_number || ""}</div>
              </div>
              <Pill tone={statusTone(r.status)}>{r.status || r.stage || "—"}</Pill>
            </div>
            <div className="mt-1.5 text-xs text-mute">{r.term || r.record_type || ""}{r.program_name ? ` · ${r.program_name}` : ""}</div>
          </Card>
        ))}
        {rows && !rows.length && <Empty title="No results" />}
      </div>

      <Card className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {columns.map((c) => <th key={c.key} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-mute">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows?.map((r, i) => (
              <tr key={i} onClick={() => rowHref && router.push(rowHref(r))}
                className={rowHref ? "cursor-pointer hover:bg-smoke/60" : ""}>
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render ? c.render(r) : c.pill
                      ? <Pill tone={statusTone(r[c.key])}>{String(r[c.key] ?? "—")}</Pill>
                      : <span className="text-sm">{String(r[c.key] ?? "—")}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length && <Empty title="No results" />}
      </Card>

      {/* pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="grid h-9 w-9 place-items-center rounded-md border border-line disabled:opacity-30"><IconArrowL width={15} height={15} /></button>
          <span className="text-sm text-mute">{page} / {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}
            className="grid h-9 w-9 place-items-center rounded-md border border-line disabled:opacity-30"><IconArrowR width={15} height={15} /></button>
        </div>
      )}
    </div>
  );
}
