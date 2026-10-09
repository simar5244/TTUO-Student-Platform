import Link from "next/link";
import { asset } from "@/lib/asset";
import { listPrograms } from "@/lib/sf";
import { IconArrowR, IconCheckCircle } from "@/components/icons";
import { ChatWidget } from "@/components/ChatWidget";
import { Logo } from "@/components/Logo";
import { ProgramFinder, Program } from "@/components/ProgramFinder";

export const dynamic = "force-dynamic";

type P = Program;

const BACHELOR = new Set(["BA", "BS", "BBA", "BAAS", "BGS", "BAS", "BFA", "BSN", "BSED"]);
const MASTER = new Set(["MA", "MS", "MED", "MAB", "MBA", "MPA", "MSW", "MEN", "MFA", "MSN"]);
const DOCTORAL = new Set(["PHD", "EDD", "DNP", "AUD", "DBA"]);
const bucketOf = (d: string) => {
  const x = (d || "").toUpperCase();
  return BACHELOR.has(x) ? "bachelor" : MASTER.has(x) ? "master" : DOCTORAL.has(x) ? "doctoral" : "cert";
};

export default async function Landing() {
  const { rows: programs } = await listPrograms(true).catch(() => ({ rows: [] as P[] }));
  const count = (set: Set<string>) => programs.filter((p) => set.has((p.degree || "").toUpperCase())).length;
  const nB = count(BACHELOR), nM = count(MASTER), nD = count(DOCTORAL);
  const nC = programs.length - nB - nM - nD;

  return (
    <main className="min-h-dvh bg-paper">
      {/* TTU utility bar — like depts.ttu.edu */}
      <div className="bg-ink text-white">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between px-4 text-[11px] font-semibold uppercase tracking-[0.15em]">
          <span className="text-neutral-300">Texas Tech University</span>
          <span className="hidden gap-5 text-neutral-400 sm:flex">
            <span>eLearning</span><span className="text-accent">·</span><span>Admissions</span>
          </span>
        </div>
      </div>

      {/* header */}
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo size={36} />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="px-3.5 py-2 text-sm font-medium hover:underline underline-offset-4">Log in</Link>
            <Link href="/signup" data-track="cta-signup"
              className="bg-accent px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-dim">
              Apply
            </Link>
          </nav>
        </div>
      </header>

      {/* hero — black band w/ ghosted Double-T */}
      <section className="relative overflow-hidden bg-ink text-white">
        <img src={asset("/logo.png")} alt="" aria-hidden
          className="pointer-events-none absolute -right-10 top-1/2 hidden w-[440px] -translate-y-1/2 opacity-[0.13] mix-blend-screen sm:block lg:-right-2 lg:w-[540px]"
          style={{ filter: "invert(1) grayscale(1) contrast(1.1)" }} />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-16 sm:pb-20 sm:pt-24">
          <div className="flex items-center gap-3">
            <span className="h-px w-10 bg-accent" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">TTU Online · 100% Online Degrees</span>
          </div>
          <h1 className="mt-6 text-[13vw] font-extrabold leading-[0.92] tracking-tight sm:text-8xl">
            Your degree.
            <br />
            <span className="text-accent">Anywhere.</span>
          </h1>
          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-md text-base leading-relaxed text-neutral-400">
              Flexible start times, 8-week courses, and built-in support — a respected Texas Tech degree on your schedule.
            </p>
            <Link href="/signup" data-track="cta-start"
              className="group inline-flex w-fit items-center gap-3 border-b-2 border-accent pb-2 text-lg font-semibold transition-colors hover:text-accent">
              Start your application
              <IconArrowR width={20} height={20} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* degree-type cards — like their Bachelor's/Master's tiles */}
      <section className="grid sm:grid-cols-3">
        {[
          { t: "Bachelor's Degrees", n: nB, d: "Finish what you started — fully online with 8-week courses.", href: "#programs" },
          { t: "Master's Degrees", n: nM, d: "Specialized skills and expert faculty, on your schedule.", href: "#programs" },
          { t: "Certificates & More", n: nC + nD, d: "Doctorates, certificates, and non-degree pathways.", href: "#programs" },
        ].map((c, i) => (
          <a key={c.t} href={c.href} data-track={`deg-${c.t}`}
            className={`group border-line p-7 transition-colors hover:bg-ink hover:text-white sm:p-9 ${i < 2 ? "border-b sm:border-b-0 sm:border-r" : ""} ${i === 0 ? "border-b sm:border-b-0" : ""}`}>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent">{String(c.n).padStart(2, "0")} programs</div>
            <h3 className="mt-3 text-2xl font-bold tracking-tight">{c.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-mute group-hover:text-neutral-400">{c.d}</p>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">
              Explore <IconArrowR width={15} height={15} className="transition-transform group-hover:translate-x-1 group-hover:text-accent" />
            </span>
          </a>
        ))}
      </section>

      {/* program finder */}
      <section id="programs" className="border-t-2 border-ink bg-smoke/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <div className="mb-8">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Find the right program for you</span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Program finder</h2>
          </div>
          <ProgramFinder programs={programs as P[]} />
        </div>
      </section>

      {/* why — hairline rows like their feature blocks */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
        <div className="mb-8 flex items-baseline justify-between">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Why Texas Tech Online?</h2>
        </div>
        <div className="border-t-2 border-ink">
          {[
            { t: "Online+ Experience", d: "8-week accelerated courses, free industry career certificates, personalized support, and credit for work-life experience." },
            { t: "Career Focused", d: "You're not just here for a degree — every program maps to real career outcomes." },
            { t: "Affordable", d: "Competitive tuition and the $10K Degree Completion Program make it more reachable than you think." },
          ].map((r, i) => (
            <div key={r.t} className="grid gap-2 border-b border-line py-6 sm:grid-cols-[60px_320px_1fr] sm:items-baseline sm:gap-8 sm:px-2">
              <span className="text-sm font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="text-xl font-bold tracking-tight">{r.t}</h3>
              <p className="text-sm leading-relaxed text-mute">{r.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* rankings strip — mirrors their #34/#66 block */}
      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px sm:grid-cols-4">
          {[
            { n: "#34", l: "Best Online Bachelor's for Veterans", s: "U.S. News 2025" },
            { n: "#66", l: "Best Online Bachelor's Programs", s: "U.S. News 2025" },
            { n: `${programs.length}+`, l: "Online programs", s: "Degrees & certificates" },
            { n: "8-wk", l: "Accelerated courses", s: "Online+ experience" },
          ].map((s) => (
            <div key={s.l} className="p-6 sm:p-8">
              <div className="text-3xl font-extrabold tracking-tight text-accent sm:text-4xl">{s.n}</div>
              <div className="mt-2 text-sm font-medium leading-snug">{s.l}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-neutral-500">{s.s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA — "Start your journey" like theirs */}
      <section className="border-b-2 border-ink">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-2 sm:items-center sm:py-20">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Start your journey with Texas Tech Online.</h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-mute">
              Request info and we'll reach out — or jump straight in and apply. Either way you get a portal to track everything.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <Link href="/signup" data-track="cta-apply"
              className="inline-flex w-full items-center justify-center gap-2 bg-accent px-6 py-4 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-dim sm:w-72">
              Apply now <IconArrowR width={16} height={16} />
            </Link>
            <Link href="/signup" data-track="cta-rfi"
              className="inline-flex w-full items-center justify-center gap-2 border-2 border-ink px-6 py-4 text-sm font-bold uppercase tracking-wide transition-colors hover:bg-ink hover:text-white sm:w-72">
              Request information
            </Link>
          </div>
        </div>
      </section>

      {/* footer — contact info like theirs */}
      <footer className="bg-paper">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
          <div>
            <Logo size={36} />
            <p className="mt-4 max-w-xs text-xs leading-relaxed text-mute">
              Accredited online degrees for busy professionals, career changers and lifelong learners.
            </p>
          </div>
          <div className="text-xs leading-loose">
            <div className="mb-2 font-bold uppercase tracking-[0.15em]">Contact</div>
            <div className="text-mute">806-742-5944</div>
            <div className="text-mute">online@ttu.edu</div>
            <div className="text-mute">2500 Broadway, Lubbock, Texas 79409</div>
          </div>
          <div className="text-xs leading-loose">
            <div className="mb-2 font-bold uppercase tracking-[0.15em]">Quick links</div>
            <div className="flex flex-col text-mute">
              <Link href="/signup" className="hover:text-ink">Apply</Link>
              <Link href="/login" className="hover:text-ink">Student login</Link>
              <a href="#programs" className="hover:text-ink">Programs</a>
            </div>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-4 text-[11px] text-mute">© 2026 Texas Tech University</div>
        </div>
      </footer>

      <ChatWidget />
    </main>
  );
}
