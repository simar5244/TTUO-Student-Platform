// Central security layer: rate limiting, security headers, CSRF origin checks,
// password policy. Single-node deployment -> in-memory sliding window is fine.
import { NextRequest, NextResponse } from "next/server";

export const IS_PROD = process.env.NODE_ENV === "production";

// ---------------- rate limiting ----------------

type Bucket = { t: number[] };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (!b.t.length || now - b.t[b.t.length - 1] > 600_000) buckets.delete(k);
}

/** Sliding-window limiter. Returns null when allowed, or a ready 429 response. */
export function rateLimit(key: string, max: number, windowMs: number): NextResponse | null {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b) { b = { t: [] }; buckets.set(key, b); }
  b.t = b.t.filter((ts) => now - ts < windowMs);
  if (b.t.length >= max) {
    const retry = Math.max(1, Math.ceil((b.t[0] + windowMs - now) / 1000));
    return NextResponse.json(
      { error: "Too many requests — slow down and try again shortly." },
      { status: 429, headers: { "Retry-After": String(retry), ...SECURITY_HEADERS } }
    );
  }
  b.t.push(now);
  return null;
}

export const reqIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

// ---------------- CSRF / origin check ----------------

/** Mutating API calls must come from our own origin (browser sends Origin on POST+). */
export function csrfOk(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients; SameSite cookies protect browsers anyway
  const allowed = process.env.ALLOWED_ORIGIN; // explicit override if app sits behind a different host
  if (allowed && origin === allowed) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

// ---------------- security headers ----------------

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",          // Next hydration needs inline scripts
  "style-src 'self' 'unsafe-inline'",           // Tailwind v4 injects inline styles
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-DNS-Prefetch-Control": "off",
};

export function applySecurityHeaders(res: NextResponse, pathname: string) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  if (IS_PROD) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    res.headers.set("Content-Security-Policy", CSP);
  }
  const authed = pathname.startsWith("/api") || pathname.startsWith("/portal") || pathname.startsWith("/admin");
  if (authed) {
    res.headers.set("Cache-Control", "no-store, must-revalidate");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

// ---------------- input hygiene ----------------

/** Trim + hard-cap string length so nobody can post megabyte payloads into text fields. */
export const str = (v: unknown, max = 500): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export const isEmail = (v: string) => /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]+$/.test(v);

// ~100 most common passwords + obvious patterns
const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123",
  "letmein123", "iloveyou1", "admin1234", "welcome1", "football1", "baseball1", "redraider",
  "texastech1", "raider123", "gunzup123", "wreckem12", "lubbock12", "sunshine1", "dragon123",
  "monkey123", "master123", "shadow123", "superman1", "trustno1", "starwars1",
]);

/** Returns an error string when the password fails policy, else null. */
export function passwordIssue(pw: string, email = ""): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters";
  if (pw.length > 128) return "Password is too long (128 max)";
  if (!/[a-z]/i.test(pw) || !/[0-9]/.test(pw)) return "Password needs at least one letter and one number";
  const low = pw.toLowerCase();
  if (COMMON.has(low)) return "That password is too common — pick something stronger";
  if (email && low.includes(email.split("@")[0].toLowerCase())) return "Password can't contain your email";
  return null;
}
