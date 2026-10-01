import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { normalizePhone } from "@/lib/auth";
import { sendOtp, verifyOtp, twilioConfigured } from "@/lib/twilio";

// Update phone / display name
export async function PATCH(req: NextRequest) {
  const user = await requireApiUser();
  if (isResp(user)) return user;
  const { phone, display_name } = await req.json();
  if (phone !== undefined) {
    const digits = normalizePhone(phone);
    if (digits.length < 10) return bad("Invalid phone");
    await q(`UPDATE ${ah("portal_users")} SET phone=$2 WHERE id=$1`, [user.id, digits]);
  }
  if (display_name !== undefined) {
    await q(`UPDATE ${ah("portal_users")} SET display_name=$2 WHERE id=$1`, [user.id, display_name]);
  }
  await audit(req, user, "action", { action: "profile_update" });
  return json({ ok: true });
}

// POST {action:'mfa_start'} -> sends OTP to phone; {action:'mfa_confirm',challengeId,code}
// {action:'mfa_off'} disables.
export async function POST(req: NextRequest) {
  const user = await requireApiUser();
  if (isResp(user)) return user;
  const body = await req.json();

  if (body.action === "mfa_start") {
    const to = normalizePhone(body.phone || user.phone || "");
    if (to.length < 10) return bad("Add a valid phone first");
    const { challengeId, devCode } = await sendOtp({ userId: user.id, to, purpose: "phone_verify" });
    return json({ ok: true, challengeId, dev: !twilioConfigured(), devCode });
  }
  if (body.action === "mfa_confirm") {
    if (!(await verifyOtp(body.challengeId, body.code))) return bad("Invalid or expired code", 401);
    await q(`UPDATE ${ah("portal_users")} SET mfa_enabled=true, mfa_phone=$2 WHERE id=$1`, [user.id, normalizePhone(body.phone || user.phone || "")]);
    await audit(req, user, "action", { action: "mfa_enabled" });
    return json({ ok: true });
  }
  if (body.action === "mfa_off") {
    await q(`UPDATE ${ah("portal_users")} SET mfa_enabled=false WHERE id=$1`, [user.id]);
    await audit(req, user, "action", { action: "mfa_disabled" });
    return json({ ok: true });
  }
  return bad("unknown action");
}
