"use client";
import { useEffect } from "react";

// The app deploys under a path prefix (/sim/AHPortal). next/link, router.push,
// server redirects and _next assets pick up basePath automatically — plain
// fetch("/api/..."), raw <a href="/..."> and window.location assignments don't.
// This patches them once at startup so every call site stays prefix-agnostic.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const LOCAL = /^\/(api|portal|admin|auth|_next)\//;

export function BasePathPatch() {
  useEffect(() => {
    if (!BASE) return;
    const orig = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && LOCAL.test(input) && !input.startsWith(BASE + "/"))
        input = BASE + input;
      return orig(input, init);
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.dataset.noprefix != null) return;
      const href = a.getAttribute("href") ?? "";
      if (LOCAL.test(href) && !href.startsWith(BASE + "/")) {
        e.preventDefault();
        window.location.assign(BASE + href);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.fetch = orig;
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
