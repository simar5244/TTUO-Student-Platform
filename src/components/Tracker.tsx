"use client";

// Anonymous-ish page tracking beacon: page views, dwell time, clicks.
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

function sid() {
  let s = sessionStorage.getItem("ah_sid");
  if (!s) {
    s = crypto.randomUUID();
    sessionStorage.setItem("ah_sid", s);
  }
  return s;
}

function send(body: Record<string, unknown>, beacon = false) {
  const payload = JSON.stringify({ ...body, sid: sid() });
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
  } else {
    fetch("/api/track", { method: "POST", body: payload, keepalive: true }).catch(() => {});
  }
}

export function Tracker() {
  const path = usePathname();
  const entered = useRef(Date.now());

  useEffect(() => {
    entered.current = Date.now();
    send({ kind: "page_view", path });
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        send({ kind: "page_view", path, duration_ms: Date.now() - entered.current }, true);
      } else {
        entered.current = Date.now();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest("[data-track]");
      if (t) send({ kind: "click", path, detail: { track: t.getAttribute("data-track"), text: (t as HTMLElement).innerText?.slice(0, 80) } });
    };
    document.addEventListener("visibilitychange", onHide);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("click", onClick, true);
    };
  }, [path]);

  return null;
}
