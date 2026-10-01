import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "crypto";
import { q, ah } from "./db";

export type Role = "student" | "advisor" | "manager" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  display_name: string | null;
  phone: string | null;
  mfa_enabled: boolean;
  sf_contact_id: string | null;
}

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);
const COOKIE = () => process.env.COOKIE_NAME || "ah_session";
const SESSION_DAYS = 7;

/** Cookie opts — Secure in production so it only travels over TLS. */
export const sessionCookie = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 86400,
});

export async function createSession(userId: string, ip?: string, ua?: string) {
  const { rows } = await q<{ id: string }>(
    `INSERT INTO ${ah("portal_sessions")} (user_id, expires_at, ip, ua)
     VALUES ($1, now() + interval '${SESSION_DAYS} days', $2, $3) RETURNING id`,
    [userId, ip ?? null, ua ?? null]
  );
  const sid = rows[0].id;
  // role is embedded in the JWT so edge middleware can gate /admin without a DB hit.
  // stale after a role change until re-login — acceptable for staff accounts.
  const role = (await q<{ role: string }>(`SELECT role FROM ${ah("portal_users")} WHERE id=$1`, [userId])).rows[0]?.role ?? "student";
  const token = await new SignJWT({ sid, uid: userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  return { token, sid };
}

export async function destroySession(sid: string) {
  await q(`DELETE FROM ${ah("portal_sessions")} WHERE id=$1`, [sid]);
}

export async function verifyToken(token: string): Promise<{ sid: string; uid: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return { sid: payload.sid as string, uid: payload.uid as string };
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE())?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const { rows } = await q<SessionUser & { sid: string }>(
    `SELECT u.id, u.email, u.role, u.display_name, u.phone, u.mfa_enabled,
            l.sf_contact_id, s.id AS sid
       FROM ${ah("portal_sessions")} s
       JOIN ${ah("portal_users")} u ON u.id = s.user_id
       LEFT JOIN ${ah("portal_identity_links")} l
         ON l.user_id = u.id AND l.status IN ('active','confirmed','pending_review')
      WHERE s.id=$1 AND s.expires_at > now() AND NOT u.disabled`,
    [payload.sid]
  );
  return rows[0] ?? null;
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("unauthenticated");
  if (roles && !roles.includes(user.role)) throw new AuthError("forbidden");
  return user;
}

export class AuthError extends Error {
  constructor(public code: "unauthenticated" | "forbidden") {
    super(code);
  }
}

// scrypt params tuned up from defaults: N=2^15, r=8, p=2 (~128MB, ~2x harder).
// Optional PASSWORD_PEPPER env adds a server-side secret on top of the per-user salt.
const SCRYPT_OPTS = { N: 32768, r: 8, p: 2, maxmem: 256 * 1024 * 1024 };
const pepper = () => process.env.PASSWORD_PEPPER || "";
const HASH_V2_PREFIX = "v2:";

export const hashPassword = (pw: string) =>
  new Promise<string>((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(pepper() + pw, salt, 64, SCRYPT_OPTS, (err, key) =>
      err ? reject(err) : resolve(`${HASH_V2_PREFIX}${salt}:${key.toString("hex")}`)
    );
  });

export const checkPassword = (pw: string, stored: string) =>
  new Promise<boolean>((resolve) => {
    const v2 = stored.startsWith(HASH_V2_PREFIX);
    const [salt, hash] = (v2 ? stored.slice(HASH_V2_PREFIX.length) : stored).split(":");
    if (!salt || !hash) return resolve(false);
    const tryPw = (candidate: string, opts: crypto.ScryptOptions, cb: (ok: boolean) => void) =>
      crypto.scrypt(candidate, salt, 64, opts, (err, key) =>
        cb(!err && key.length === Buffer.from(hash, "hex").length &&
           crypto.timingSafeEqual(Buffer.from(hash, "hex"), key)));
    if (v2) {
      tryPw(pepper() + pw, SCRYPT_OPTS, resolve);
    } else {
      // legacy hash — verify with old params (and old pepper-less input), then flag for rehash
      tryPw(pw, {}, (ok) => ok ? resolve(true) : tryPw(pepper() + pw, {}, resolve));
    }
  });

/** True when the stored hash uses the old scheme — caller should rehash on next login. */
export const needsRehash = (stored: string) => !stored.startsWith(HASH_V2_PREFIX);

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function normalizePhone(p: string | null | undefined): string {
  return (p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

export async function logActivity(opts: {
  userId?: string | null;
  sessionId?: string | null;
  kind: string;
  path?: string;
  detail?: Record<string, unknown>;
  durationMs?: number;
  ip?: string;
  ua?: string;
}) {
  await q(
    `INSERT INTO ${ah("portal_activity")} (user_id, session_id, kind, path, detail, duration_ms, ip, ua)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      opts.userId ?? null,
      opts.sessionId ?? null,
      opts.kind,
      opts.path ?? null,
      JSON.stringify(opts.detail ?? {}),
      opts.durationMs ?? null,
      opts.ip ?? null,
      opts.ua ?? null,
    ]
  );
}
