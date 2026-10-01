import { NextRequest } from "next/server";
import { q, ah } from "@/lib/db";
import { createSession, logActivity, sessionCookie } from "@/lib/auth";
import { verifyOtp } from "@/lib/twilio";
import { json, bad, clientInfo } from "@/lib/api";
import { rateLimit, reqIp } from "@/lib/security";

const COOKIE = process.env.COOKIE_NAME || "ah_session";

export async function POST(req: NextRequest) {
  const { challengeId, code, userId } = await req.json().catch(() => ({}));
  if (!challengeId || !code || !userId) return bad("Missing fields");
  if (!/^\d{4,10}$/.test(String(code))) return bad("Invalid or expired code", 401);

  const rl = rateLimit(`mfa:${reqIp(req)}:${challengeId}`, 5, 10 * 60_000);
  if (rl) return rl;

  const challenge = await q(
    `SELECT user_id, purpose FROM ${ah("portal_otp")} WHERE id=$1`, [challengeId]);
  if (!challenge.rows[0] || challenge.rows[0].user_id !== userId || challenge.rows[0].purpose !== "login_mfa")
    return bad("Invalid challenge", 400);

  if (!(await verifyOtp(challengeId, String(code)))) {
    await logActivity({ userId, kind: "security", detail: { event: "failed_mfa" }, ip: reqIp(req) });
    return bad("Invalid or expired code", 401);
  }

  const { ip, ua } = clientInfo(req);
  const { token } = await createSession(userId, ip ?? undefined, ua ?? undefined);
  await q(`UPDATE ${ah("portal_users")} SET last_login_at=now() WHERE id=$1`, [userId]);
  await logActivity({ userId, kind: "login", detail: { mfa: true }, ip: ip ?? undefined, ua: ua ?? undefined });
  const res = json({ ok: true });
  res.cookies.set(COOKIE, token, sessionCookie());
  return res;
}
