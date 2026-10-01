import Link from "next/link";
import { Logo } from "./Logo";

export function AuthShell({ title, sub, children, footer }: {
  title: string; sub?: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* brand panel */}
      <div className="hidden flex-col justify-between bg-ink p-10 text-white lg:flex">
        <Link href="/"><Logo dark size={36} /></Link>
        <div>
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-10 bg-accent" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Admissions</span>
          </div>
          <h2 className="max-w-md text-5xl font-extrabold leading-[1.0] tracking-tight">One portal.<br />Every step<br />of admission.</h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-neutral-400">
            Apply, upload documents, track requirements, and talk with advisors — for TTU Online programs.
          </p>
        </div>
        <div className="text-xs text-neutral-500">Texas Tech University · eLearning</div>
      </div>

      {/* form panel */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm fade-up">
          <Link href="/" className="mb-8 inline-block lg:hidden"><Logo size={36} /></Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {sub && <p className="mt-1 text-sm text-mute">{sub}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-mute">{footer}</div>}
        </div>
      </div>
    </main>
  );
}
