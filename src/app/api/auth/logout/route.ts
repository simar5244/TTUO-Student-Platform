import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { destroySession, verifyToken, logActivity } from "@/lib/auth";
import { json, clientInfo } from "@/lib/api";

const COOKIE = process.env.COOKIE_NAME || "ah_session";

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      await destroySession(payload.sid);
      const { ip, ua } = clientInfo(req);
      await logActivity({ userId: payload.uid, kind: "logout", ip: ip ?? undefined, ua: ua ?? undefined });
    }
  }
  const res = json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
