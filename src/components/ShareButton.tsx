"use client";

import { useState } from "react";

export function ShareButton({ program, term }: { program?: string; term?: string }) {
  const [copied, setCopied] = useState(false);
  const text = `I just applied to ${program ? `${program} at ` : ""}TTU Online${term ? ` for ${term}` : ""}! 🌵`;

  async function share() {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: "TTU Online", text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* user dismissed share sheet */ }
  }

  return (
    <button onClick={share} data-track="share-applied"
      className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap border-2 border-ink px-4 py-3 text-sm font-bold uppercase tracking-wide transition-colors hover:bg-ink hover:text-white">
      {copied ? "Link copied!" : "Tell everyone"}
    </button>
  );
}
