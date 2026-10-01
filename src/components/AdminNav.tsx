"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "./ui";
import { IconGrid, IconUsers, IconDoc, IconMerge, IconList, IconChat, IconShield, IconClock, IconChart, IconLogout, IconMenu, IconX, IconSend } from "./icons";
import { Logo } from "./Logo";
import type { Role } from "@/lib/auth";

const NAV: { href: string; label: string; icon: any; roles: Role[] }[] = [
  { href: "/admin", label: "Dashboard", icon: IconGrid, roles: ["advisor", "manager", "admin"] },
  { href: "/admin/leads", label: "Leads", icon: IconUsers, roles: ["advisor", "manager", "admin"] },
  { href: "/admin/applications", label: "Applications", icon: IconDoc, roles: ["advisor", "manager", "admin"] },
  { href: "/admin/review", label: "Review queue", icon: IconList, roles: ["advisor", "manager", "admin"] },
  { href: "/admin/match", label: "Match & merge", icon: IconMerge, roles: ["manager", "admin"] },
  { href: "/admin/chat", label: "Chat", icon: IconChat, roles: ["advisor", "manager", "admin"] },
  { href: "/admin/analytics", label: "Analytics", icon: IconChart, roles: ["manager", "admin"] },
  { href: "/admin/users", label: "Staff & users", icon: IconUsers, roles: ["admin"] },
  { href: "/admin/audit", label: "Audit trail", icon: IconClock, roles: ["admin"] },
  { href: "/admin/outbox", label: "SF outbox", icon: IconSend, roles: ["admin"] },
];

export function AdminNav({ role, name }: { role: Role; name: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(role));
  const active = (h: string) => (h === "/admin" ? path === h : path.startsWith(h));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/"); router.refresh();
  }

  const links = (
    <>
      {items.map((it) => (
        <Link key={it.href} href={it.href} onClick={() => setOpen(false)} data-track={`anav-${it.label}`}
          className={cn("flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium",
            active(it.href) ? "bg-ink text-white" : "text-mute hover:bg-smoke hover:text-ink")}>
          <it.icon width={17} height={17} />{it.label}
        </Link>
      ))}
    </>
  );

  return (
    <>
      {/* mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-paper px-4 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-smoke" aria-label="Menu"><IconMenu /></button>
        <span className="flex items-center gap-2"><Logo size={28} /><span className="text-xs font-semibold text-mute">Admin</span></span>
        <button onClick={logout} className="rounded-lg p-2 text-mute hover:bg-smoke" aria-label="Log out"><IconLogout width={18} height={18} /></button>
      </header>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-paper p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">Admin · {role}</span>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-smoke"><IconX width={18} height={18} /></button>
            </div>
            <nav className="space-y-1">{links}</nav>
            <button onClick={logout} className="mt-4 flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium text-accent hover:bg-accent/5">
              <IconLogout width={17} height={17} /> Sign out
            </button>
          </div>
        </div>
      )}

      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-paper p-4 lg:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2.5 px-1">
          <Logo size={34} />
          <span className="rounded-full bg-smoke px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mute">Admin</span>
        </Link>
        <nav className="flex-1 space-y-1">{links}</nav>
        <div className="border-t border-line pt-3">
          <div className="mb-1 truncate px-1 text-xs text-mute">{name}</div>
          <div className="mb-2 flex items-center gap-1.5 px-1"><Pill role={role} /></div>
          <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-accent hover:bg-accent/5">
            <IconLogout width={16} height={16} /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

function Pill({ role }: { role: Role }) {
  const label = { admin: "Superadmin", manager: "Manager", advisor: "Advisor", student: "Student" }[role];
  return <span className="rounded-full bg-smoke px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{label}</span>;
}
