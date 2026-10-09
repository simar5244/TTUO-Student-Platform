"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader, Card, Pill, Empty, statusTone } from "@/components/ui";
import { IconCheck, IconClock, IconCheckCircle, IconX, IconBell } from "@/components/icons";

type Item = {
  id: string; key: string | null; label: string; required: boolean; status: string;
  note: string | null; docs: number; sf?: boolean; sf_status?: string | null;
  description?: string | null; sf_modified?: string | null;
};
type Reminder = { item_ref: string; send_on: string };
type Resp = { items: Item[]; source?: "sf" | "local" | "none"; pending?: string | null; applyEnabled?: boolean; reminders?: Reminder[] };

const DONE = ["approved", "waived"];
const SEEN_KEY = "ah_seen_received";

export default function ChecklistPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [remindFor, setRemindFor] = useState<string | null>(null);
  const [remindDate, setRemindDate] = useState("");
  const [remindErr, setRemindErr] = useState("");

  useEffect(() => {
    fetch("/api/checklist", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setData({ items: d.items ?? [], source: d.source, pending: d.pending, applyEnabled: d.applyEnabled, reminders: d.reminders ?? [] });
      // milestone moment: items confirmed by TTU since this device last saw them
      try {
        const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
        const fresh = (d.items ?? []).filter((i: Item) => i.sf && DONE.includes(i.status) && !seen.has(i.id)).map((i: Item) => i.id);
        setFreshIds(fresh);
      } catch { /* localStorage unavailable — skip celebration */ }
    });
  }, []);

  const items = data?.items;
  const done = items?.filter((i) => DONE.includes(i.status)).length ?? 0;
  const total = items?.length ?? 0;
  const remaining = total - done;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const display = (s: string) => s === "pushed" ? "in Salesforce" : s === "in_progress" ? "in progress" : s.replace(/_/g, " ");
  const next = items?.find((i) => !DONE.includes(i.status) && i.status !== "submitted" && i.status !== "pushed" && !i.id.startsWith("meta-"))
    ?? items?.find((i) => !DONE.includes(i.status));

  // goal-gradient copy: the closer to done, the more direct the push
  const sub = !items?.length ? "Loading…"
    : remaining === 0 ? "All done — you're set."
    : remaining === 1 ? "1 item left — you're almost there."
    : remaining <= Math.ceil(total * 0.35) ? `${remaining} to go — nearly done.`
    : `${done} of ${total} complete`;

  function dismissFresh() {
    try {
      const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
      freshIds.forEach((id) => seen.add(id));
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
    } catch { /* noop */ }
    setFreshIds([]);
  }
  const freshItems = useMemo(() => items?.filter((i) => freshIds.includes(i.id)) ?? [], [items, freshIds]);
  const reminders = useMemo(() => new Map((data?.reminders ?? []).map((r) => [r.item_ref, r.send_on])), [data?.reminders]);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const maxStr = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().slice(0, 10); }, []);

  async function setReminder(itemId: string) {
    if (!remindDate) return;
    const r = await fetch("/api/checklist", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remind", item_id: itemId, send_on: remindDate, confirm_sms: true }) });
    if (r.ok) {
      setData((d) => d && { ...d, reminders: [...(d.reminders ?? []).filter((x) => x.item_ref !== itemId), { item_ref: itemId, send_on: remindDate }] });
      setRemindFor(null); setRemindDate(""); setRemindErr("");
    } else {
      const d = await r.json().catch(() => null);
      setRemindErr(d?.error === "add a phone number in Profile first" ? "Add a phone number on your Profile page first." : "Couldn't save — try again.");
    }
  }
  async function cancelReminder(itemId: string) {
    const r = await fetch("/api/checklist", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_reminder", item_id: itemId }) });
    if (r.ok) setData((d) => d && { ...d, reminders: (d.reminders ?? []).filter((x) => x.item_ref !== itemId) });
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Checklist" sub={sub} />

      {/* progress — slim, always visible once items exist */}
      {!!total && (
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wide text-mute">Progress</span>
            <span className="font-semibold tabular-nums">{done}/{total}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-sm bg-smoke">
            <div className={`h-full transition-all duration-700 ${remaining === 0 ? "bg-accent" : "bg-ink"}`} style={{ width: `${pct}%` }} />
          </div>
          {next && remaining > 0 && (
            <div className="mt-2.5 text-sm">
              <span className="truncate text-mute">Next: <span className="font-medium text-ink">{next.label}</span></span>
            </div>
          )}
        </Card>
      )}

      {/* just received — one-time celebration per item */}
      {!!freshItems.length && (
        <Card className="flex items-start gap-3 border-ink/15 p-4">
          <IconCheckCircle width={18} height={18} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium">Texas Tech received {freshItems.length === 1 ? "your" : `${freshItems.length} of your`} item{freshItems.length === 1 ? "" : "s"}.</span>
            <span className="text-mute"> {freshItems.map((i) => i.label).join(", ")} — checked off below.</span>
          </div>
          <button onClick={dismissFresh} className="shrink-0 rounded-md p-1 text-mute hover:bg-smoke" aria-label="Dismiss"><IconX width={14} height={14} /></button>
        </Card>
      )}

      {data?.pending && <Card className="p-4 text-sm text-mute">{data.pending}</Card>}

      <div className="space-y-2.5">
        {items?.map((it, idx) => {
          const open = !DONE.includes(it.status) && !it.id.startsWith("meta-");
          const rem = reminders.get(it.id);
          return (
          <Card key={it.id} className="p-4">
            <div className="flex items-center gap-4">
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${DONE.includes(it.status) ? "border-ink bg-ink text-white" : "border-line text-mute"}`}>
                {DONE.includes(it.status) ? <IconCheck width={15} height={15} />
                  : ["submitted", "pushed"].includes(it.status) ? <IconClock width={15} height={15} />
                  : <span className="text-xs font-semibold">{idx + 1}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {open ? (
                    <Link href={it.sf ? `/portal/documents?sf_item=${it.id}&req=${encodeURIComponent(it.key ?? "")}` : `/portal/documents?item=${it.id}`}
                      className="truncate text-sm font-medium hover:underline underline-offset-2">{it.label}</Link>
                  ) : it.id === "meta-application" && !DONE.includes(it.status) && data?.applyEnabled ? (
                    <Link href="/portal/apply" className="truncate text-sm font-medium hover:underline underline-offset-2">{it.label}</Link>
                  ) : (
                    <span className="truncate text-sm font-medium">{it.label}</span>
                  )}
                  {it.required && !it.id.startsWith("meta-") && <span className="text-[10px] font-semibold text-accent">REQ</span>}
                </div>
                {it.note && <div className="mt-0.5 text-xs text-accent">Note from advisor: {it.note}</div>}
                {it.sf && it.sf_status && !DONE.includes(it.status) && (
                  <div className="mt-0.5 text-xs text-mute">Texas Tech: {it.sf_status}</div>
                )}
                {it.status === "pushed" && <div className="mt-0.5 text-xs text-mute">Uploaded to Salesforce — waiting for confirmation</div>}
                {it.status === "submitted" && it.sf && <div className="mt-0.5 text-xs text-mute">Received — pending advisor review</div>}
                {rem && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-mute">
                    <IconBell width={11} height={11} /> We'll text you {new Date(rem + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    <button onClick={() => cancelReminder(it.id)} className="underline underline-offset-2 hover:text-ink">cancel</button>
                  </div>
                )}
                {it.docs > 0 && <div className="mt-0.5 text-xs text-mute">{it.docs} file{it.docs === 1 ? "" : "s"} attached</div>}
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={statusTone(it.status)}>{display(it.status)}</Pill>
                {open && (
                  <button onClick={() => { setRemindFor(remindFor === it.id ? null : it.id); setRemindDate(""); setRemindErr(""); }}
                    className={`grid h-9 w-9 place-items-center rounded-md border ${rem ? "border-ink text-ink" : "border-line text-mute hover:text-ink hover:border-ink"}`}
                    aria-label="Set a reminder">
                    <IconBell width={15} height={15} />
                  </button>
                )}
              </div>
            </div>
            {remindFor === it.id && (
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                <input type="date" min={todayStr} max={maxStr} value={remindDate} onChange={(e) => setRemindDate(e.target.value)}
                  className="h-9 rounded-md border border-line bg-white px-2 text-sm" />
                <button onClick={() => setReminder(it.id)} disabled={!remindDate}
                  className="h-9 rounded-md bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">Remind me</button>
                <span className="text-[11px] text-mute">{remindErr || "One text, that morning."}</span>
              </div>
            )}
          </Card>
          );
        })}
      </div>

      {items && !items.length && !data?.pending && (
        <Empty title="No checklist yet" hint="Your requirements will appear here." />
      )}
    </div>
  );
}
