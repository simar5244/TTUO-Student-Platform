import { asset } from "@/lib/asset";

// Texas Tech Double-T mark + wordmark. `dark` inverts text for dark panels.
export function Logo({ dark = false, size = 34 }: { dark?: boolean; size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid shrink-0 place-items-center overflow-hidden rounded-md bg-white"
        style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset("/logo.png")} alt="Texas Tech" className="h-[82%] w-[82%] object-contain" />
      </span>
      <span className={`text-sm tracking-tight ${dark ? "text-white" : "text-ink"}`}>
        <span className="font-extrabold">TTU</span> <span className="font-medium text-accent">Online</span>
      </span>
    </span>
  );
}
