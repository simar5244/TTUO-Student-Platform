import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, SessionUser, Role, logActivity } from "./auth";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export function clientInfo(req: NextRequest) {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ua: req.headers.get("user-agent") ?? null,
  };
}

export async function sessionOrNull(): Promise<SessionUser | null> {
  return getSessionUser();
}

export async function requireApiUser(roles?: Role[]): Promise<SessionUser | NextResponse> {
  const u = await getSessionUser();
  if (!u) return bad("unauthenticated", 401);
  if (roles && !roles.includes(u.role)) return bad("forbidden", 403);
  return u;
}

export function isResp(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

export async function audit(req: NextRequest, user: SessionUser | null, kind: string, detail: Record<string, unknown>, path?: string) {
  const { ip, ua } = clientInfo(req);
  await logActivity({ userId: user?.id, kind, detail, ip: ip ?? undefined, ua: ua ?? undefined, path });
}
