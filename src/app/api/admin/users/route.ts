import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";

// Admin only: manage portal users (roles, disable)
export async function GET(req: NextRequest) {
  const user = await requireApiUser(["admin"]);
  if (isResp(user)) return user;
  const search = req.nextUrl.searchParams.get("search");
  const { rows } = await q(
    `SELECT u.id, u.email, u.display_name, u.role, u.phone, u.mfa_enabled, u.disabled, u.created_at, u.last_login_at,
            l.sf_contact_id, l.status AS link_status
     FROM ${ah("portal_users")} u
     LEFT JOIN ${ah("portal_identity_links")} l ON l.user_id=u.id AND l.status IN ('active','confirmed','pending_review')
     ${search ? "WHERE u.email ILIKE $1 OR u.display_name ILIKE $1" : ""}
     ORDER BY u.created_at DESC LIMIT 200`,
    search ? [`%${search}%`] : []);
  return json({ users: rows });
}

// POST {userId, role} | {userId, disabled:bool} | {email,password,display_name,role} create staff
export async function POST(req: NextRequest) {
  const user = await requireApiUser(["admin"]);
  if (isResp(user)) return user;
  const body = await req.json();

  if (body.email && body.password) {
    const { hashPassword } = await import("@/lib/auth");
    if (!["advisor", "manager", "admin"].includes(body.role)) return bad("staff role required");
    const exists = await q(`SELECT 1 FROM ${ah("portal_users")} WHERE lower(email)=lower($1)`, [body.email]);
    if (exists.rowCount) return bad("email exists", 409);
    const hash = await hashPassword(body.password);
    const { rows } = await q(`INSERT INTO ${ah("portal_users")} (email, phone, password_hash, display_name, role) VALUES (lower($1),$2,$3,$4,$5) RETURNING id`,
      [body.email, body.phone ?? null, hash, body.display_name ?? null, body.role]);
    await q(`INSERT INTO ${ah("portal_identity_links")} (user_id, match_type, status) VALUES ($1,'none','active')`, [rows[0].id]);
    await audit(req, user, "admin_action", { action: "create_staff", email: body.email, role: body.role });
    return json({ ok: true });
  }

  if (!body.userId) return bad("userId required");
  if (body.userId === user.id && body.disabled) return bad("can't disable yourself");

  if (body.role) {
    if (!["student", "advisor", "manager", "admin"].includes(body.role)) return bad("bad role");
    await q(`UPDATE ${ah("portal_users")} SET role=$2 WHERE id=$1`, [body.userId, body.role]);
    await audit(req, user, "admin_action", { action: "set_role", userId: body.userId, role: body.role });
  }
  if (body.disabled !== undefined) {
    await q(`UPDATE ${ah("portal_users")} SET disabled=$2 WHERE id=$1`, [body.userId, !!body.disabled]);
    if (body.disabled) await q(`DELETE FROM ${ah("portal_sessions")} WHERE user_id=$1`, [body.userId]);
    await audit(req, user, "admin_action", { action: body.disabled ? "disable_user" : "enable_user", userId: body.userId });
  }
  return json({ ok: true });
}
