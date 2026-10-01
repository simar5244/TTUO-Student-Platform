import { NextRequest } from "next/server";
import { q, ah } from "@/lib/db";
import { checkPassword, createSession, hashPassword, logActivity, needsRehash, sessionCookie } from "@/lib/auth";
import { sendOtp, twilioConfigured } from "@/lib/twilio";
import { json, bad, clientInfo } from "@/lib/api";
import { isEmail, rateLimit, str } from "@/lib/security";

const COOKIE = process.env.COOKIE_NAME || "ah_session";
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = str(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password.slice(0, 128) : "";
  if (!email || !password) return bad("Email and password required");
  if (!isEmail(email)) return bad("Invalid credentials", 401);

  // per-email + per-IP brute-force throttle (on top of middleware IP limit)
  const { ip, ua } = clientInfo(req);
  const rl = rateLimit(`login:${email}:${ip ?? "local"}`, MAX_FAILS, LOCK_MINUTES * 60_000);
  if (rl) return rl;

  const { rows } = await q<{
    id: string; password_hash: string; mfa_enabled: boolean;
    mfa_phone: string | null; phone: string | null; disabled: boolean; locked_until: Date | null;
  }>(
    `SELECT id, password_hash, mfa_enabled, mfa_phone, phone, disabled, locked_until
     FROM ${ah("portal_users")} WHERE lower(email)=lower($1)`,
    [email]
  );
  const user = rows[0];

  // timing-safe: always run scrypt even when the user doesn't exist
  const DUMMY = "v2:" + "0".repeat(32) + ":" + "0".repeat(128);
  const ok = user ? await checkPassword(password, user.password_hash) : await checkPassword(password, DUMMY).then(() => false);

  if (!ok) {
    if (user) {
      const fails = await q<{ failed_attempts: number }>(
        `UPDATE ${ah("portal_users")}
           SET failed_attempts = failed_attempts + 1,
               locked_until = CASE WHEN failed_attempts + 1 >= ${MAX_FAILS}
                                   THEN now() + interval '${LOCK_MINUTES} minutes' ELSE locked_until END
         WHERE id=$1 RETURNING failed_attempts`, [user.id]);
      await logActivity({ userId: user.id, kind: "security", detail: { event: "failed_login", fails: fails.rows[0]?.failed_attempts }, ip: ip ?? undefined, ua: ua ?? undefined });
    }
    return bad("Invalid credentials", 401);
  }

  if (user.disabled) return bad("Account disabled — contact support", 403);
  if (user.locked_until && new Date(user.locked_until) > new Date())
    return bad(`Too many failed attempts — try again in ${LOCK_MINUTES} minutes`, 429);

  await q(`UPDATE ${ah("portal_users")} SET failed_attempts=0, locked_until=NULL WHERE id=$1`, [user.id]);

  // transparently upgrade old scrypt params to v2 on successful login
  if (needsRehash(user.password_hash)) {
    const hash = await hashPassword(password).catch(() => null);
    if (hash) await q(`UPDATE ${ah("portal_users")} SET password_hash=$2 WHERE id=$1`, [user.id, hash]);
  }

  // MFA required -> send OTP, client must verify via /api/auth/mfa
  if (user.mfa_enabled) {
    const to = user.mfa_phone || user.phone;
    if (!to) return bad("No phone on file for MFA", 400);
    const { challengeId, devCode } = await sendOtp({ userId: user.id, to, purpose: "login_mfa" });
    return json({ mfa: true, challengeId, userId: user.id, dev: !twilioConfigured(), devCode });
  }

  const { token } = await createSession(user.id, ip ?? undefined, ua ?? undefined);
  await q(`UPDATE ${ah("portal_users")} SET last_login_at=now() WHERE id=$1`, [user.id]);
  await logActivity({ userId: user.id, kind: "login", ip: ip ?? undefined, ua: ua ?? undefined });
  const res = json({ ok: true });
  res.cookies.set(COOKIE, token, sessionCookie());
  return res;
}
