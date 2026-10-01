import { NextRequest } from "next/server";
import { getSessionUser, logActivity } from "@/lib/auth";
import { json, clientInfo } from "@/lib/api";

export async function POST(req: NextRequest) {
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* sendBeacon blob */ }
  const { kind, path, detail, duration_ms, sid } = body;
  if (!kind) return json({ ok: false }, 400);
  const user = await getSessionUser().catch(() => null);
  const { ip, ua } = clientInfo(req);
  await logActivity({
    userId: user?.id ?? null,
    sessionId: (sid as string) ?? null,
    kind: String(kind).slice(0, 32),
    path: typeof path === "string" ? path.slice(0, 300) : undefined,
    detail: (detail as Record<string, unknown>) ?? {},
    durationMs: typeof duration_ms === "number" ? Math.round(duration_ms) : undefined,
    ip: ip ?? undefined, ua: ua ?? undefined,
  });
  return json({ ok: true });
}
