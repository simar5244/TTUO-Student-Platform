"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./ui";

export type Option = { value: string; label: string; sub?: string };

export function Dropdown({
  options, value, onChange, placeholder = "Select…", disabled, searchable, empty = "No matches",
}: {
  options: Option[]; value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean; searchable?: boolean; empty?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  const selected = options.find((o) => o.value === value);
  const filtered = query
    ? options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => { setHi(0); }, [query, open]);
  useEffect(() => { itemRefs.current[hi]?.scrollIntoView({ block: "nearest" }); }, [hi]);

  function pick(v: string) { onChange(v); setOpen(false); setQuery(""); }

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (["Enter", " ", "ArrowDown"].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "Escape") setOpen(false);
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    if (e.key === "Enter" && filtered[hi]) { e.preventDefault(); pick(filtered[hi].value); }
  }

  return (
    <div ref={ref} className="relative" onKeyDown={onKey}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} data-track="dropdown"
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border bg-white px-3.5 py-2.5 text-left text-sm outline-none transition-colors disabled:bg-smoke",
          open ? "border-ink" : "border-line hover:border-neutral-400 focus:border-ink"
        )}>
        <span className={cn("truncate", !selected && "text-mute")}>{selected?.label || placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={cn("shrink-0 text-mute transition-transform", open && "rotate-180")}>
          <path d="m6 9 6 6 6-6" strokeLinecap="square" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-ink bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
          {searchable && (
            <div className="border-b border-line p-2">
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type to search…"
                className="w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-ink" />
            </div>
          )}
          <ul className="max-h-64 overflow-auto py-1" role="listbox">
            {filtered.map((o, i) => (
              <li key={o.value} ref={(el) => { itemRefs.current[i] = el; }} role="option" aria-selected={o.value === value}
                onMouseDown={(e) => { e.preventDefault(); pick(o.value); }} onMouseEnter={() => setHi(i)}
                className={cn("cursor-pointer px-3.5 py-2.5", i === hi ? "bg-ink text-white" : "")}>
                <span className={cn("block truncate text-sm", o.value === value && "font-semibold")}>{o.label}</span>
                {o.sub && <span className={cn("block truncate text-xs", i === hi ? "text-neutral-400" : "text-mute")}>{o.sub}</span>}
              </li>
            ))}
            {!filtered.length && <li className="px-3.5 py-3 text-sm text-mute">{empty}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
