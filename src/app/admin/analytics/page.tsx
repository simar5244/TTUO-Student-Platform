"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card, Pill, Empty, Spinner } from "@/components/ui";

const fmtDur = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export default function AnalyticsPage() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/admin/analytics").then((r) => r.json()).then(setD); }, []);
  if (!d) return <div className="py-20 text-center"><Spinner /></div>;

  const maxDay = Math.max(...d.daily.map((x: any) => x.events), 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" sub="Where students spend time — page views, dwell time, sessions (30 days)" />

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
