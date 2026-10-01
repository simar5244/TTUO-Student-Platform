"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "./ui";
import { IconHome, IconDoc, IconList, IconUpload, IconChat, IconUser, IconLogout } from "./icons";
import { Logo } from "./Logo";

const items = [
  { href: "/portal", label: "Home", icon: IconHome, exact: true },
  { href: "/portal/apply", label: "Apply", icon: IconDoc },
  { href: "/portal/checklist", label: "Checklist", icon: IconList },
  { href: "/portal/documents", label: "Docs", icon: IconUpload },
  { href: "/portal/messages", label: "Chat", icon: IconChat },
  { href: "/portal/profile", label: "Profile", icon: IconUser },
];

export function PortalNav({ name }: { name: string }) {
  const path = usePathname();
  const router = useRouter();
  const active = (it: (typeof items)[0]) => (it.exact ? path === it.href : path.startsWith(it.href));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/"); router.refresh();
  }

  return (
    <>
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/portal"><Logo /></Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-mute sm:block">{name}</span>
            <button onClick={logout} aria-label="Log out" className="rounded-lg p-2 text-mute hover:bg-smoke hover:text-ink">
              <IconLogout width={18} height={18} />
            </button>
          </div>
        </div>
        {/* desktop tab row */}
        <nav className="mx-auto hidden max-w-4xl gap-1 px-4 pb-2 sm:flex">
          {items.map((it) => (
            <Link key={it.href} href={it.href} data-track={`nav-${it.label}`}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
                active(it) ? "bg-ink text-white" : "text-mute hover:bg-smoke hover:text-ink")}>
              <it.icon width={15} height={15} />{it.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-safe sm:hidden">
        <div className="grid grid-cols-6">
          {items.map((it) => (
            <Link key={it.href} href={it.href}
              className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium",
                active(it) ? "text-ink" : "text-mute")}>
              <it.icon width={19} height={19} strokeWidth={active(it) ? 2.1 : 1.7} />
              {it.label}
              {active(it) && <span className="h-0.5 w-4 rounded-full bg-accent" />}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
