import { NextRequest } from "next/server";
import path from "path";
import fs from "fs/promises";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { normalizePhone, checkPassword, hashPassword } from "@/lib/auth";
import { passwordIssue } from "@/lib/security";
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

  if (body.action === "change_password") {
    const cur = typeof body.current === "string" ? body.current : "";
    const next = typeof body.next === "string" ? body.next : "";
    const pwErr = passwordIssue(next, user.email);
    if (pwErr) return bad(pwErr);
    const { rows } = await q<{ password_hash: string }>(
      `SELECT password_hash FROM ${ah("portal_users")} WHERE id=$1`, [user.id]);
    if (!rows[0] || !(await checkPassword(cur, rows[0].password_hash)))
      return bad("Current password is incorrect", 401);
    await q(`UPDATE ${ah("portal_users")} SET password_hash=$2 WHERE id=$1`,
      [user.id, await hashPassword(next)]);
    await audit(req, user, "action", { action: "password_changed" });
    return json({ ok: true });
  }

  // Permanent account deletion: files off disk, then the user row (cascades
  // clear links, applications, checklist items, docs, chat, projection;
  // activity rows anonymize via ON DELETE SET NULL).
  if (body.action === "delete_account") {
    if (body.confirm !== true) return bad("confirm required");
    await audit(req, user, "action", { action: "account_deleted" });

    const files = await q<{ stored_name: string }>(
      `SELECT stored_name FROM ${ah("portal_documents")} WHERE user_id=$1`, [user.id]);
    const dir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
    for (const f of files.rows)
      await fs.unlink(path.join(dir, f.stored_name)).catch(() => {});

    await q(`DELETE FROM ${ah("portal_users")} WHERE id=$1`, [user.id]);
    const res = json({ ok: true });
    res.cookies.set(process.env.COOKIE_NAME || "ah_session", "", { path: "/", maxAge: 0 });
    return res;
  }
  return bad("unknown action");
}
