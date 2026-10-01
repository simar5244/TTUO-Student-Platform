import { NextRequest } from "next/server";
import { q, ah } from "@/lib/db";
import { hashPassword, logActivity } from "@/lib/auth";
import { verifyOtp } from "@/lib/twilio";
import { json, bad, clientInfo } from "@/lib/api";
import { passwordIssue, rateLimit, reqIp } from "@/lib/security";

export async function POST(req: NextRequest) {
  const { challengeId, code, password } = await req.json().catch(() => ({}));
  if (!challengeId || !code || !password) return bad("Missing fields");
  const pwErr = passwordIssue(password);
  if (pwErr) return bad(pwErr);

  const rl = rateLimit(`reset:${reqIp(req)}`, 10, 10 * 60_000);
  if (rl) return rl;

  const { rows } = await q<{ user_id: string; purpose: string }>(
    `SELECT user_id, purpose FROM ${ah("portal_otp")} WHERE id=$1`, [challengeId]);
  const ch = rows[0];
  if (!ch || ch.purpose !== "password_reset") return bad("Invalid challenge", 400);
  if (!(await verifyOtp(challengeId, code))) return bad("Invalid or expired code", 401);

  const hash = await hashPassword(password);
  await q(`UPDATE ${ah("portal_users")} SET password_hash=$2 WHERE id=$1`, [ch.user_id, hash]);
  await q(`DELETE FROM ${ah("portal_sessions")} WHERE user_id=$1`, [ch.user_id]); // kill all sessions
  const { ip, ua } = clientInfo(req);
  await logActivity({ userId: ch.user_id, kind: "security", detail: { event: "password_reset" }, ip: ip ?? undefined, ua: ua ?? undefined });
  return json({ ok: true });
}
