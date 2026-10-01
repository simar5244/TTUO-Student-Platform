import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { applySecurityHeaders, csrfOk, rateLimit, reqIp } from "@/lib/security";

const COOKIE = process.env.COOKIE_NAME || "ah_session";
const STAFF = new Set(["advisor", "manager", "admin"]);

async function jwtRole(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET!));
    return (payload.role as string) ?? null;
  } catch {
    return null;
  }
}

// Per-path rate limits: [pathPrefix, max, windowMs]
const API_LIMITS: [string, number, number][] = [
  ["/api/auth/login",    10,  5 * 60_000],   // 10 tries / 5 min per IP
  ["/api/auth/signup",    5, 60 * 60_000],   // 5 signups / hour per IP
  ["/api/auth/forgot",    5, 60 * 60_000],   // 5 resets / hour per IP
  ["/api/auth/mfa",      10,  5 * 60_000],
  ["/api/auth/reset",    10,  5 * 60_000],
  ["/api/documents",     20, 10 * 60_000],   // uploads
  ["/api/chat",          60,      60_000],
  ["/api/track",        120,      60_000],
  ["/api/",              240,     60_000],   // catch-all for every other API
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- API hardening ---
  if (pathname.startsWith("/api/")) {
    if (!csrfOk(req)) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 }),
        pathname
      );
    }
    const ip = reqIp(req);
    for (const [prefix, max, win] of API_LIMITS) {
      if (pathname.startsWith(prefix)) {
        const blocked = rateLimit(`${ip}:${prefix}`, max, win);
        if (blocked) return applySecurityHeaders(blocked, pathname);
        break;
      }
    }
  }

  // landing page hidden for now — root goes straight to login
  if (pathname === "/") return NextResponse.redirect(new URL("/login", req.url));

  // --- page auth gate (JWT checked here so page components never run for unauthorized roles) ---
  const needsAuth = pathname.startsWith("/portal") || pathname.startsWith("/admin");
  if (needsAuth) {
    const token = req.cookies.get(COOKIE)?.value;
    const role = token ? await jwtRole(token) : null;
    if (!token || !role) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (pathname.startsWith("/admin") && !STAFF.has(role)) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }

  return applySecurityHeaders(NextResponse.next(), pathname);
}

export const config = {
  matcher: [
    // everything except next internals + static assets
    "/((?!_next/static|_next/image|favicon.ico|logo.png|mascot/).*)",
  ],
};
