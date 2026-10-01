// Twilio Verify wrapper with dev fallback.
// If TWILIO_* envs are missing, codes are mocked: any challenge accepts "424242"
// and the code is logged server-side.

import crypto from "crypto";
import { q, ah } from "./db";
import { sha256 } from "./auth";

const SID = () => process.env.TWILIO_ACCOUNT_SID;
const TOKEN = () => process.env.TWILIO_AUTH_TOKEN;
const VERIFY = () => process.env.TWILIO_VERIFY_SID;
const DEV_CODE = "424242";

export const twilioConfigured = () => !!(SID() && TOKEN() && VERIFY());

async function twilio(path: string, body: Record<string, string>) {
  const res = await fetch(`https://verify.twilio.com/v2/Services/${VERIFY()}/${path}`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${SID()}:${TOKEN()}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  return res.json();
}

/** Send an OTP. Returns challenge id to pass to verifyOtp. */
export async function sendOtp(opts: {
  userId?: string;
  to: string;
  purpose: "login_mfa" | "password_reset" | "phone_verify";
}): Promise<{ challengeId: string; devCode?: string }> {
  const dest = opts.to.startsWith("+") ? opts.to : `+1${opts.to.replace(/\D/g, "")}`;

  if (twilioConfigured()) {
    const r = await twilio("Verifications", { To: dest, Channel: "sms" });
    const { rows } = await q<{ id: string }>(
      `INSERT INTO ${ah("portal_otp")} (user_id, purpose, destination, twilio_sid, expires_at)
       VALUES ($1,$2,$3,$4, now() + interval '10 minutes') RETURNING id`,
      [opts.userId ?? null, opts.purpose, dest, r.sid ?? null]
    );
    return { challengeId: rows[0].id };
  }

  // Dev mode: store hash of the fixed code
  const { rows } = await q<{ id: string }>(
    `INSERT INTO ${ah("portal_otp")} (user_id, purpose, destination, code_hash, expires_at)
     VALUES ($1,$2,$3,$4, now() + interval '10 minutes') RETURNING id`,
    [opts.userId ?? null, opts.purpose, dest, sha256(DEV_CODE)]
  );
  console.log(`[DEV OTP] ${opts.purpose} -> ${dest}: ${DEV_CODE}`);
  return { challengeId: rows[0].id, devCode: DEV_CODE };
}

export async function verifyOtp(challengeId: string, code: string): Promise<boolean> {
  const { rows } = await q<{
    id: string; expires_at: Date; used_at: Date | null; twilio_sid: string | null;
    destination: string; code_hash: string | null; attempts: number;
  }>(`SELECT * FROM ${ah("portal_otp")} WHERE id=$1`, [challengeId]);
  const c = rows[0];
  if (!c || c.used_at || new Date(c.expires_at) < new Date() || c.attempts >= 5) return false;
  await q(`UPDATE ${ah("portal_otp")} SET attempts = attempts + 1 WHERE id=$1`, [challengeId]);

  let ok: boolean;
  if (twilioConfigured() && c.twilio_sid) {
    const r = await twilio("VerificationCheck", { To: c.destination, Code: code });
    ok = r.status === "approved";
  } else {
    ok = sha256(code) === c.code_hash || code === DEV_CODE;
  }
  if (ok) await q(`UPDATE ${ah("portal_otp")} SET used_at=now() WHERE id=$1`, [challengeId]);
  return ok;
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
