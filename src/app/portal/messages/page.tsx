"use client";

import { useEffect, useRef, useState } from "react";
import { asset } from "@/lib/asset";
import { PageHeader, Button, Spinner } from "@/components/ui";
import { IconSend } from "@/components/icons";

type Msg = { id: number; sender_kind: "student" | "admin" | "bot"; body: string; created_at: string };

export default function MessagesPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  async function poll() {
    const r = await fetch(`/api/chat?after=${lastId.current}`);
    const d = await r.json();
    if (d.thread) setClaimed(!!d.thread.claimed_by);
    if (d.messages?.length) {
      lastId.current = d.messages[d.messages.length - 1].id;
      setMsgs((m) => [...m, ...d.messages]);
    }
  }

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    const r = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft }),
    });
    setBusy(false);
    if (r.ok) { setDraft(""); poll(); }
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col sm:h-[calc(100dvh-10rem)]">
      <PageHeader title="Messages" sub={claimed ? "Connected with an advisor" : "Raider Red + advisors"} />

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-line bg-smoke/40 p-4">
        {!msgs.length && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset("/mascot/encourage.png")} alt="Raider Red" className="h-24 w-24 object-contain" />
            <p className="mt-3 max-w-xs text-sm text-mute">Raider Red is here! Ask anything about your application, requirements, or deadlines.</p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.sender_kind === "student" ? "justify-end" : "justify-start"}`}>
            {m.sender_kind === "bot" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset("/mascot/encourage.png")} alt="Raider Red" className="mr-2 mt-1 h-8 w-8 shrink-0 rounded-full border border-line bg-white object-cover object-top" />
            )}
            <div className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
              m.sender_kind === "student" ? "rounded-br-sm bg-ink text-white"
              : m.sender_kind === "bot" ? "rounded-bl-sm border border-line bg-white"
              : "rounded-bl-sm bg-accent text-white"}`}>
              {m.sender_kind !== "student" && (
                <div className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.sender_kind === "bot" ? "text-mute" : "text-white/70"}`}>
                  {m.sender_kind === "bot" ? "Raider Red" : "Advisor"}
                </div>
              )}
              {m.body}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…"
          className="flex-1 rounded-md border border-line px-4 py-3 text-sm outline-none focus:border-ink" />
        <Button disabled={busy || !draft.trim()} className="px-4">{busy ? <Spinner /> : <IconSend width={17} height={17} />}</Button>
      </form>
    </div>
  );
}
