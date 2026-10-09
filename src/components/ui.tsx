import React from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return <div onClick={onClick} className={cn("rounded-lg border border-line bg-white", onClick && "cursor-pointer", className)}>{children}</div>;
}

export function Button({
  children, variant = "primary", className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" }) {
  const styles = {
    primary: "bg-ink text-white hover:bg-neutral-800 active:bg-black",
    outline: "border border-ink text-ink hover:bg-ink hover:text-white",
    ghost: "text-ink hover:bg-smoke",
    danger: "bg-accent text-white hover:bg-accent-dim",
  }[variant];
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none", styles, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn("w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-ink placeholder:text-mute", props.className)}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn("w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-ink", props.className)}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}
    </label>
  );
}

const pillStyles: Record<string, string> = {
  ok: "bg-ink text-white",
  warn: "bg-white text-accent border border-accent",
  danger: "bg-accent text-white",
  mute: "bg-smoke text-mute",
  outline: "border border-line text-ink",
};

export function Pill({ children, tone = "mute" }: { children: React.ReactNode; tone?: keyof typeof pillStyles }) {
  return <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap", pillStyles[tone])}>{children}</span>;
}

export function statusTone(s?: string | null): keyof typeof pillStyles {
  switch ((s || "").toLowerCase()) {
    case "accepted": case "admitted": case "approved": case "active": case "confirmed": case "done": case "auto_full": case "submitted_ok":
      return "ok";
    case "denied": case "rejected": case "withdrawn": case "disabled":
      return "danger";
    case "pending_review": case "needs review": case "in review": case "in_review": case "pending": case "in progress": case "in_progress": case "auto_partial": case "incomplete": case "uploaded": case "pushed":
      return "warn";
    default:
      return "mute";
  }
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-mute">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}
    </Card>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line py-14 text-center">
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="mt-1 text-xs text-mute">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-mute">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Spinner() {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
