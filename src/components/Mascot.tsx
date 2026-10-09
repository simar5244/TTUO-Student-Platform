import React from "react";
import { asset } from "@/lib/asset";

export type MascotState = "sad" | "encourage" | "celebrate";

const SRC: Record<MascotState, string> = {
  sad: asset("/mascot/sad.png"),
  encourage: asset("/mascot/encourage.png"),
  celebrate: asset("/mascot/celebrate.png"),
};

// Raider Red — appears on the student dashboard and adapts to their journey.
export function Mascot({ state, className }: { state: MascotState; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC[state]}
      // PNGs carry a baked white background; multiply blends it into whatever
      // light surface (white / smoke) the mascot sits on.
      style={{ mixBlendMode: "multiply" }}
      alt={state === "sad" ? "Raider Red waiting" : state === "celebrate" ? "Raider Red celebrating" : "Raider Red cheering you on"}
      className={`object-contain ${className ?? ""}`}
    />
  );
}

// CSS confetti over the dancing Raider on the celebrate state.
function ConfettiRain() {
  const colors = ["#111111", "#cc0000", "#111111", "#cc0000", "#ffffff", "#111111"];
  return (
    <>
      {colors.map((bg, i) => {
        const left = [5, 17, 28, 40, 52, 63, 74, 85, 95, 11, 45, 79][i % 12];
        const w = 5 + (i % 3) * 3;
        const h = 8 + (i % 4) * 4;
        return (
          <span key={i} className="confetti"
            style={{
              left: `${left}%`, width: w, height: h, background: bg,
              border: bg === "#ffffff" ? "1px solid #11111122" : undefined,
              borderRadius: i % 4 === 0 ? "50%" : "1px",
              animationDelay: `${(i * 0.33) % 2.6}s`,
              animationDuration: `${2.6 + (i % 4) * 0.5}s`,
            }} />
        );
      })}
      {colors.map((bg, i) => {
        const left = [9, 22, 33, 49, 58, 70, 81, 90, 3, 30, 66, 88][i % 12];
        const w = 5 + ((i + 2) % 3) * 3;
        const h = 8 + ((i + 1) % 4) * 4;
        return (
          <span key={`b${i}`} className="confetti"
            style={{
              left: `${left}%`, width: w, height: h, background: bg,
              border: bg === "#ffffff" ? "1px solid #11111122" : undefined,
              borderRadius: i % 3 === 0 ? "50%" : "1px",
              animationDelay: `${((i * 0.33) + 1.3) % 2.6}s`,
              animationDuration: `${2.9 + ((i + 2) % 4) * 0.4}s`,
            }} />
        );
      })}
    </>
  );
}

export function MascotCard({ state, title, sub, action }: {
  state: MascotState; title: React.ReactNode; sub: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border-2 border-ink bg-white">
      {state === "celebrate" && <ConfettiRain />}
      <div className="relative grid items-center sm:grid-cols-[200px_1fr]">
        <div className="grid place-items-center bg-smoke/40 px-6 py-5 sm:h-full sm:border-r sm:border-line">
          <Mascot state={state} className="h-40 w-40 sm:h-44 sm:w-44" />
        </div>
        <div className="p-5 sm:p-7">
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-mute">{sub}</p>
          {action && <div className="mt-4 flex flex-col gap-2 sm:flex-row">{action}</div>}
        </div>
      </div>
    </div>
  );
}
