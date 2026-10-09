import { NextRequest } from "next/server";
import { q, ah } from "@/lib/db";
import { hashPassword, createSession, logActivity, normalizePhone, sessionCookie } from "@/lib/auth";
import { linkUserToContact } from "@/lib/match";
import { json, bad, clientInfo } from "@/lib/api";
import { isEmail, passwordIssue, str } from "@/lib/security";

const COOKIE = process.env.COOKIE_NAME || "ah_session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = str(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const phone = str(body.phone, 32);
  const name = str(body.name, 120);

  if (!isEmail(email)) return bad("Valid email required");
  const pwErr = passwordIssue(password, email);
  if (pwErr) return bad(pwErr);
  if (!phone || normalizePhone(phone).length < 10) return bad("Valid 10-digit phone required");

  const exists = await q(`SELECT 1 FROM ${ah("portal_users")} WHERE lower(email)=lower($1)`, [email]);
  if (exists.rowCount) return bad("An account with this email already exists", 409);

  const { ip, ua } = clientInfo(req);
  const hash = await hashPassword(password);
  const { rows } = await q<{ id: string }>(
    `INSERT INTO ${ah("portal_users")} (email, phone, password_hash, display_name, role)
     VALUES (lower($1), $2, $3, $4, 'student') RETURNING id`,
    [email, normalizePhone(phone), hash, name || null]
  );
  const userId = rows[0].id;

  const match = await linkUserToContact(userId, email, phone, name);
  await logActivity({ userId, kind: "action", detail: { action: "signup", match } , ip: ip ?? undefined, ua: ua ?? undefined });

  const { token } = await createSession(userId, ip ?? undefined, ua ?? undefined);
  const res = json({ ok: true, match });
  res.cookies.set(COOKIE, token, sessionCookie());
  return res;
}
