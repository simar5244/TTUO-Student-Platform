import { NextRequest } from "next/server";
import { q, ah } from "@/lib/db";
import { sendOtp, twilioConfigured } from "@/lib/twilio";
import { json } from "@/lib/api";
import { rateLimit, reqIp, str } from "@/lib/security";

// Forgot password via SMS OTP (Twilio). Always returns ok to avoid enumeration.
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (!email) return json({ ok: true });

  // throttle OTP sends per-email AND per-IP regardless of whether the account exists
  if (rateLimit(`forgot-ip:${reqIp(req)}`, 5, 60 * 60_000)) return json({ ok: true });
  if (rateLimit(`forgot:${str(email, 254).toLowerCase()}`, 3, 60 * 60_000)) return json({ ok: true });

  const { rows } = await q<{ id: string; phone: string | null; mfa_phone: string | null }>(
    `SELECT id, phone, mfa_phone FROM ${ah("portal_users")} WHERE lower(email)=lower($1) AND NOT disabled`,
    [str(email, 254)]
  );
  const user = rows[0];
  const to = user?.mfa_phone || user?.phone;
  if (!user || !to) return json({ ok: true });

  const { challengeId, devCode } = await sendOtp({ userId: user.id, to, purpose: "password_reset" });
  return json({ ok: true, challengeId, userId: user.id, dev: !twilioConfigured(), devCode });
}
