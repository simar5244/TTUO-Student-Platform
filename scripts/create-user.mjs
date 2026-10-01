// Create a portal user. Usage: node scripts/create-user.mjs <email> <password> <role> [name]
// roles: student | advisor | manager | admin
import pg from "pg";
import crypto from "crypto";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const SCHEMA = env.APP_SCHEMA || "AH";

const [, , email, password, role = "admin", name = ""] = process.argv;
if (!email || !password) { console.log("usage: node scripts/create-user.mjs <email> <password> <role> [name]"); process.exit(1); }

const hash = await new Promise((res, rej) => {
  const salt = crypto.randomBytes(16).toString("hex");
  crypto.scrypt(password, salt, 64, (e, k) => e ? rej(e) : res(`${salt}:${k.toString("hex")}`));
});

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const { rows } = await pool.query(
  `INSERT INTO "${SCHEMA}".portal_users (email, password_hash, role, display_name)
   VALUES (lower($1), $2, $3, $4) RETURNING id`,
  [email, hash, role, name || null]
);
await pool.query(`INSERT INTO "${SCHEMA}".portal_identity_links (user_id, match_type, status) VALUES ($1,'none','active')`, [rows[0].id]);
console.log(`created ${role}: ${email} (${rows[0].id})`);
await pool.end();
