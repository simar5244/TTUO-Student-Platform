"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Card, Pill, Button, Empty, Spinner, Stat } from "@/components/ui";
import { IconClock } from "@/components/icons";

const tone = (s: string): "ok" | "warn" | "danger" | "mute" =>
  s === "ok" ? "ok" : s === "error" ? "danger" : s === "running" ? "warn" : "mute";

export default function SyncPage() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/sync");
    const j = await r.json();
    setD(j);
    // keep polling while a run is in flight
    const running = j.runs?.some((x: any) => x.status === "running");
    if (running && !poll.current) {
      poll.current = setInterval(async () => {
        const r2 = await fetch("/api/admin/sync");
        const j2 = await r2.json();
        setD(j2);
        if (!j2.runs?.some((x: any) => x.status === "running") && poll.current) {
          clearInterval(poll.current); poll.current = null;
        }
      }, 4000);
    }
  }, []);

  useEffect(() => { load(); return () => { if (poll.current) clearInterval(poll.current); }; }, [load]);

  async function refresh() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }) });
    const j = await r.json();
    setBusy(false);
    setMsg(j.skipped ? `Skipped — ${j.skipped}` : j.ok ? "Sync complete." : `Sync failed: ${j.error}`);
    load();
  }

  if (!d) return <div className="py-20 text-center"><Spinner /></div>;

  const counts = Object.fromEntries((d.counts ?? []).map((c: any) => [c.table, c]));
  const lastRun = d.runs?.[0];

  return (
    <div className="space-y-6">
      <PageHeader title="Data sync" sub="Clone of the TTU Online Salesforce slice — refreshed on a timer or on demand."
        right={<Button onClick={refresh} disabled={busy}><IconClock width={15} height={15} />{busy ? "Running…" : "Refresh now"}</Button>} />

      {msg && <Card className="border-ink/20 bg-smoke p-3 text-sm">{msg}</Card>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Interval" value={`${d.intervalMinutes}m`} sub="SYNC_INTERVAL_MINUTES (0 = off)" />
        <Stat label="Last success" value={d.lastSuccess ? new Date(d.lastSuccess).toLocaleString() : "never"} sub={lastRun ? `last run: ${lastRun.trigger}` : "no runs yet"} />
        <Stat label="Contacts" value={(counts.sf_contact?.n ?? 0).toLocaleString()} sub="cloned slice" />
        <Stat label="Applications" value={(counts.sf_application?.n ?? 0).toLocaleString()} sub="cloned slice" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contact history" value={(counts.sf_contact_hist?.n ?? 0).toLocaleString()} sub="append-only versions" />
        <Stat label="App history" value={(counts.sf_application_hist?.n ?? 0).toLocaleString()} sub="append-only versions" />
        <Stat label="Linked records" value={(counts.portal_contact_projection?.n ?? 0).toLocaleString()} sub="portal↔SF projections" />
        <Stat label="Status" value={lastRun ? lastRun.status : "—"} sub={lastRun ? `started ${new Date(lastRun.started_at).toLocaleTimeString()}` : ""} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Run history <span className="text-mute">(latest 25)</span></h2>
        {!d.runs?.length && <Empty title="No syncs yet" hint="The engine runs at boot and on its interval — or hit Refresh now." />}
        {!!d.runs?.length && (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-mute">
                  <th className="px-4 py-2.5">Started</th><th className="px-4 py-2.5">Trigger</th>
                  <th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Contacts</th>
                  <th className="px-4 py-2.5">Applications</th><th className="px-4 py-2.5">Duration</th>
                  <th className="px-4 py-2.5">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.runs.map((r: any) => {
                  const ms = r.finished_at ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime() : null;
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{new Date(r.started_at).toLocaleString()}</td>
                      <td className="px-4 py-2.5">{r.trigger}</td>
                      <td className="px-4 py-2.5">
                        <Pill tone={tone(r.status)}>{r.status}</Pill>
                        {r.error && <span className="ml-2 text-xs text-accent" title={r.error}>{r.error.slice(0, 60)}</span>}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{r.stats?.contact ? `${r.stats.contact.seen.toLocaleString()} / ${r.stats.contact.changed.toLocaleString()} chg` : "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.stats?.application ? `${r.stats.application.seen.toLocaleString()} / ${r.stats.application.changed.toLocaleString()} chg` : "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{ms != null ? `${(ms / 1000).toFixed(1)}s` : "…"}</td>
                      <td className="px-4 py-2.5 text-xs text-mute">{r.actor_email || r.trigger}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
