"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconArrowR, IconSearch } from "./icons";

export type Program = { id: string; name: string; degree: string; college: string };

const BACHELOR = new Set(["BA", "BS", "BBA", "BAAS", "BGS", "BAS", "BFA", "BSN", "BSED"]);
const MASTER = new Set(["MA", "MS", "MED", "MAB", "MBA", "MPA", "MSW", "MEN", "MFA", "MSN"]);
const DOCTORAL = new Set(["PHD", "EDD", "DNP", "AUD", "DBA"]);
const TYPES = ["All", "Bachelor's", "Master's", "Doctoral", "Certificate"] as const;

function bucket(degree: string | null): string {
  const d = (degree || "").toUpperCase();
  if (BACHELOR.has(d)) return "Bachelor's";
  if (MASTER.has(d)) return "Master's";
  if (DOCTORAL.has(d)) return "Doctoral";
  return "Certificate";
}

export function ProgramFinder({ programs }: { programs: Program[] }) {
  const [type, setType] = useState<(typeof TYPES)[number]>("All");
  const [area, setArea] = useState("");
  const [search, setSearch] = useState("");

  const areas = useMemo(
    () => [...new Set(programs.map((p) => p.college).filter(Boolean))].sort(),
    [programs]
  );
  const filtered = useMemo(
    () =>
      programs.filter(
        (p) =>
          (type === "All" || bucket(p.degree) === type) &&
          (!area || p.college === area) &&
          (!search || p.name.toLowerCase().includes(search.toLowerCase()))
      ),
    [programs, type, area, search]
  );

  return (
    <div>
      {/* filter bar */}
      <div className="mb-6 space-y-3">
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)} data-track={`filter-${t}`}
              className={`shrink-0 border px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                type === t ? "border-ink bg-ink text-white" : "border-line bg-white text-mute hover:border-ink hover:text-ink"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" width={15} height={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search programs…"
              className="w-full border border-line bg-white px-3.5 py-2.5 pl-9 text-sm outline-none focus:border-ink" />
          </div>
          <select value={area} onChange={(e) => setArea(e.target.value)}
            className="border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-ink sm:w-72">
            <option value="">All areas of interest</option>
            {areas.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* results */}
      <div className="border-t-2 border-ink bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-mute sm:px-6">
          <span>{filtered.length} program{filtered.length === 1 ? "" : "s"}</span>
          <span>100% online</span>
        </div>
        {filtered.slice(0, 15).map((p, i) => (
          <Link key={p.id} href="/signup" data-track="program-row"
            className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-line px-4 py-4 transition-colors hover:bg-ink hover:text-white sm:px-6">
            <span className="w-7 text-xs font-bold text-mute group-hover:text-accent">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className="block truncate font-semibold tracking-tight">{p.name}</span>
              <span className="block text-xs text-mute group-hover:text-neutral-400">{p.college || "Texas Tech University"}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="border border-ink/20 px-2 py-0.5 text-[11px] font-bold group-hover:border-accent group-hover:text-accent">{p.degree}</span>
              <IconArrowR width={16} height={16} className="text-mute transition-transform group-hover:translate-x-1 group-hover:text-accent" />
            </span>
          </Link>
        ))}
        {!filtered.length && (
          <div className="px-6 py-10 text-center text-sm text-mute">No programs match — try clearing a filter.</div>
        )}
        {filtered.length > 15 && (
          <Link href="/signup" className="block px-4 py-4 text-center text-sm font-semibold transition-colors hover:bg-ink hover:text-white sm:px-6">
            View all {filtered.length} matches →
          </Link>
        )}
      </div>
    </div>
  );
}
