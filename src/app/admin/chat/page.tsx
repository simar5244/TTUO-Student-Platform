"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader, Card, Pill, Button, Empty, Spinner } from "@/components/ui";
import { IconSend, IconChat } from "@/components/icons";

type Thread = { id: string; email: string; display_name: string; status: string; subject: string; last_msg: string; updated_at: string; claimed_by: string | null };
type Msg = { id: number; sender_kind: string; body: string; created_at: string };

export default function AdminChat() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState<Thread | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const lastId = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  const loadThreads = () => fetch("/api/admin/chat").then((r) => r.json()).then((d) => setThreads(d.threads ?? []));

  async function poll() {
    if (!open) return;
    const r = await fetch(`/api/admin/chat?thread=${open.id}&after=${lastId.current}`);
    const d = await r.json();
    if (d.messages?.length) {
      lastId.current = d.messages[d.messages.length - 1].id;
      setMsgs((m) => [...m, ...d.messages]);
    }
    if (d.thread) setOpen((t) => t && { ...t, ...d.thread });
  }

  useEffect(() => { loadThreads(); const t = setInterval(loadThreads, 5000); return () => clearInterval(t); }, []);
  useEffect(() => { setMsgs([]); lastId.current = 0; firstLoad.current = true; if (open) poll(); const t = setInterval(poll, 2500); return () => clearInterval(t); }, [open?.id]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // jump straight to the latest on first load; only animate for live updates
    el.scrollTo({ top: el.scrollHeight, behavior: firstLoad.current ? "instant" : "smooth" });
    firstLoad.current = false;
  }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !open) return;
    await fetch("/api/admin/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thread: open.id, body: draft }) });
    setDraft(""); poll(); loadThreads();
  }
  async function op(o: string) {
    if (!open) return;
    await fetch("/api/admin/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thread: open.id, op: o }) });
    if (o === "close") { setOpen(null); }
    loadThreads(); poll();
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Tickets" sub="Student conversations — claim a thread to take over from the bot" />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* thread list */}
        <Card className="max-h-[70dvh] divide-y divide-line overflow-y-auto">
          {!threads.length && <div className="p-6"><Empty title="No open chats" /></div>}
          {threads.map((t) => (
            <button key={t.id} onClick={() => setOpen(t)}
              className={`block w-full px-4 py-3.5 text-left hover:bg-smoke/60 ${open?.id === t.id ? "bg-smoke" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{t.display_name || t.email}</span>
                <Pill tone={t.status === "open" ? "warn" : "mute"}>{t.status}</Pill>
              </div>
              <div className="mt-0.5 truncate text-xs text-mute">{t.last_msg || t.subject}</div>
            </button>
          ))}
        </Card>

        {/* conversation */}
        <Card className="flex h-[70dvh] flex-col">
          {!open ? (
            <div className="flex h-full flex-col items-center justify-center text-mute">
              <IconChat width={28} height={28} /><p className="mt-2 text-sm">Pick a conversation</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{open.display_name || open.email}</div>
                  <div className="text-xs text-mute">{open.email} {open.claimed_by ? "· claimed" : "· unclaimed (bot replying)"}</div>
                </div>
                <div className="flex gap-2">
                  {!open.claimed_by && <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => op("claim")}>Claim</Button>}
                  <Button variant="ghost" className="px-3 py-1.5 text-xs text-accent" onClick={() => op("close")}>Close</Button>
                </div>
              </div>
              <div ref={box} className="flex-1 space-y-3 overflow-y-auto p-4">
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_kind === "admin" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3.5 py-2.5 text-sm ${
                      m.sender_kind === "admin" ? "rounded-br-sm bg-ink text-white"
                      : m.sender_kind === "bot" ? "rounded-bl-sm border border-line bg-white"
                      : "rounded-bl-sm bg-smoke"}`}>
                      {m.sender_kind !== "admin" && <div className="mb-0.5 text-[10px] font-semibold uppercase text-mute">{m.sender_kind === "bot" ? "Raider Red" : "Student"}</div>}
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Reply as advisor…"
                  className="flex-1 rounded-md border border-line px-4 py-2.5 text-sm outline-none focus:border-ink" />
                <Button className="px-4" disabled={!draft.trim()}><IconSend width={16} height={16} /></Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
