# Security Model — TTU Online Portal

Public-facing admissions app. This doc covers every control in place and the
server hardening checklist for deployment on `tosmonline0001.ttu.edu`.

## Authentication & Sessions

- **Passwords:** scrypt `N=32768, r=8, p=2` (memory-hard, ~2× OWASP baseline) +
  optional server-side `PASSWORD_PEPPER`. Format `v2:salt:hash`; legacy hashes
  verify via fallback and are transparently rehashed to v2 on next login.
- **Password policy:** ≥10 chars, letter + number required, not on a common-password
  blocklist, can't contain the user's email.
- **MFA:** Twilio Verify SMS OTP. Codes are hashed (SHA-256) at rest, expire in
  10 min, max 5 attempts per challenge. Dev mode uses `424242` — only when
  `TWILIO_*` is unset; prod boot prints a warning if it is.
- **Sessions:** HS256 JWT + DB session row (`AH.portal_sessions`), 7-day expiry,
  `httpOnly` + `sameSite=lax` + `secure` (prod) cookie. Password reset kills ALL
  sessions for that user. Sessions store IP/UA for audit.
- **Lockout:** 5 failed logins → 15-min account lock (`locked_until` column).
  Failed logins are logged to `portal_activity` as `kind='security'`.
- **Timing attack:** login always runs scrypt even for unknown emails.

## Rate Limiting (`src/middleware.ts` + `src/lib/security.ts`)

Sliding-window, per-IP (X-Forwarded-For first hop). Single-node in-memory — fine
for 200–5k users. Tuned per endpoint:

| Endpoint                | Limit            |
|-------------------------|------------------|
| `/api/auth/login`       | 10 / 5 min       |
| `/api/auth/signup`      | 5 / hour         |
| `/api/auth/forgot`      | 5 / hour + 3/hr per email |
| `/api/auth/mfa`,`reset` | 10 / 5 min       |
| `/api/documents` (upload) | 20 / 10 min    |
| `/api/chat`             | 60 / min         |
| `/api/track`            | 120 / min        |
| all other `/api/*`      | 240 / min        |

429 responses include `Retry-After`.

## CSRF & CORS

- Every non-GET `/api/*` request is checked: `Origin` must match `Host`
  (or `ALLOWED_ORIGIN` if set). Mismatch → 403.
- `sameSite=lax` cookies mean cross-site POSTs never carry the session anyway.
- No CORS headers are emitted — browsers can't call the API cross-origin at all.
- `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` set.

## Headers (applied to every response via middleware)

- `Content-Security-Policy` (prod): `default-src 'self'`, no external anything,
  `frame-ancestors 'none'` (clickjacking), `object-src 'none'`, `form-action 'self'`
- `Strict-Transport-Security` (prod): `max-age=2y; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: camera/mic/geolocation/FLoC all off
- `Cache-Control: no-store` + `X-Robots-Tag: noindex` on `/api`, `/portal`, `/admin`
- `poweredByHeader: false` — doesn't advertise Next.js

## Data Protection

**In transit:**
- App ↔ browser: HTTPS only in prod (HSTS + `secure` cookies). Terminate TLS at
  the reverse proxy or use `next start` behind nginx/Apache.
- App ↔ Postgres: `PGSSLMODE=verify-full`/`require` supported via pool `ssl` config.

**At rest:**
- Uploaded documents: AES-256-GCM with `DOC_ENC_KEY` (random IV per file,
  `AHENC1` magic prefix, auth tag appended). Key never in the repo/DB — env only.
  Files written `chmod 600` into `UPLOAD_DIR` (outside web root).
- OTP codes: SHA-256 hashed at rest.
- PII lives in `AH.portal_*` tables — Postgres data dir should sit on an
  encrypted volume (LUKS/FileVault on server) for full at-rest coverage.
- **Rotation warning:** changing `PASSWORD_PEPPER` or `DOC_ENC_KEY` breaks
  existing hashes/files. Rotate by supporting both keys or re-keying offline.

## Input / Injection

- All SQL is parameterized (`q(text, params)`) — no string interpolation of user data.
- All identifiers are double-quoted via `ah()`/`sf()` helpers.
- Inputs: trimmed + length-capped (`str()` helper), emails regex-validated,
  OTPs restricted to `\d{4,10}`, UUID params validated before use.
- Uploads: extension allowlist + **magic-byte sniffing** (client MIME is untrusted);
  stored under random UUID names — original filename is metadata only.
- File downloads: path traversal guarded (`..` rejection + resolved-path prefix
  check), `nosniff` + private cache headers, owner-or-staff authorization.
- JSON body size: Next.js default limits apply; uploads capped at 15 MB.

## Authorization

- `requireApiUser(roles)` on every API route; `student`/`advisor`/`manager`/`admin`.
- Middleware gates `/portal` + `/admin` pages on session cookie.
- Students can only read their own documents/messages/checklist.
- `sf_origin` (Salesforce mirror) is **read-only** for the app — every change is
  written to `AH.portal_outbox` for manual superadmin processing. The app cannot
  mutate warehouse data by design.

## Audit

`portal_activity` records every page view, click, login/logout, security event
(failed login, failed MFA, password reset), and admin action with IP + UA +
timestamp. Admin-only view at `/admin/audit`.

## Deployment checklist for tosmonline0001.ttu.edu

1. **Env:** set strong random values — `SESSION_SECRET` (≥32 chars),
   `PASSWORD_PEPPER`, `DOC_ENC_KEY`, `TWILIO_*`. Rotate all dev values.
2. **DB:** `DATABASE_URL`/`WAREHOUSE_URL` with `?sslmode=verify-full`, dedicated
   `lumen_app` role with least privilege (SELECT on `sf_origin`, CRUD on `AH.portal_*`,
   NO write on `sf_origin`), `pg_hba.conf` localhost/TLS-only.
3. **Reverse proxy:** nginx/Apache terminating TLS, forwarding
   `X-Forwarded-For`, redirecting 80→443. Get a cert (Let's Encrypt or TTU-issued).
4. **Node:** `NODE_ENV=production`, `npm ci --omit=dev`, `next build`,
   `next start -p 3000` behind the proxy, systemd unit for auto-restart.
5. **Uploads:** `UPLOAD_DIR` on an encrypted volume, outside the app dir,
   `chmod 700` dir + `chmod 600` files, regular backup (files are encrypted —
   back up `DOC_ENC_KEY` separately in the secrets store).
6. **Firewall (ufw/iptables):** allow 443/80 + SSH only; Postgres 5432 bound to
   localhost; deny everything else inbound.
7. **OS:** disk encryption, `unattended-upgrades`, fail2ban for SSH, disable
   password SSH auth (keys only), non-root user for the app process.
8. **Secrets:** never commit `.env.local`; `PASSWORD_PEPPER`/`DOC_ENC_KEY`/`SESSION_SECRET`
   live only on the server (and a secure backup).
9. **Verify after deploy:** `curl -I https://…` shows HSTS+CSP; `/login` sets
   `Secure` cookie; invalid Origin POST returns 403; 11th login attempt → 429.
