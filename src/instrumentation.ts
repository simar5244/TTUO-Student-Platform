// Runs once at server boot. Fails fast in production if required env is missing/weak.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // arm the Salesforce clone sync engine (scheduled + boot catch-up)
  const { startSyncLoop } = await import("./lib/sync");
  startSyncLoop();
  const prod = process.env.NODE_ENV === "production";

  const secret = process.env.SESSION_SECRET || "";
  if (prod && secret.length < 32)
    throw new Error("[security] SESSION_SECRET must be set and at least 32 characters in production");
  if (!secret) console.warn("[security] SESSION_SECRET unset — sessions will not sign");

  if (!process.env.DATABASE_URL) console.warn("[security] DATABASE_URL unset — app cannot reach Postgres");

  if (prod) {
    if (!process.env.TWILIO_ACCOUNT_SID) console.warn("[security] TWILIO_* unset — MFA falls back to dev code 424242!");
    if (!process.env.DOC_ENC_KEY) console.warn("[security] DOC_ENC_KEY unset — uploaded documents stored UNENCRYPTED");
    if (!process.env.PASSWORD_PEPPER) console.warn("[security] PASSWORD_PEPPER unset — password hashes have no server-side pepper");
  }
}
