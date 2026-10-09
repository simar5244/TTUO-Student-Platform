import { asset } from "@/lib/asset";

// Pulsating TTU logo loading screen — logo fades toward ~30% opacity, never fully disappears.
export function Loading({ label }: { label?: string }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-pulse-logo grid h-20 w-20 place-items-center rounded-md bg-white border-2 border-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset("/logo.png")} alt="Loading" className="h-[82%] w-[82%] object-contain" />
        </div>
        {label && <span className="text-xs font-semibold uppercase tracking-[0.2em] text-mute">{label}</span>}
      </div>
    </div>
  );
}
