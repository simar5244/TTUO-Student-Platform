// Item reminders — a student picks a date for an open checklist item and we
// text them that day. Uses Twilio's Messages API (separate from Verify):
// needs TWILIO_ACCOUNT_SID/AUTH_TOKEN plus TWILIO_FROM (E.164) or
// TWILIO_MESSAGING_SID. Without them reminders record `no_twilio` and no SMS
// goes out — the feature degrades gracefully instead of failing loudly.
import { ah, q } from "./db";

const SID = () => process.env.TWILIO_ACCOUNT_SID;
const TOKEN = () => process.env.TWILIO_AUTH_TOKEN;
const FROM = () => process.env.TWILIO_MESSAGING_SID || process.env.TWILIO_FROM;
const smsConfigured = () => !!(SID() && TOKEN() && FROM());

export async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!smsConfigured()) return { ok: false, error: "no_twilio" };
  const payload: Record<string, string> = { To: to, Body: body };
  if (process.env.TWILIO_MESSAGING_SID) payload.MessagingServiceSid = process.env.TWILIO_MESSAGING_SID;
  else payload.From = process.env.TWILIO_FROM!;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID()}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${SID()}:${TOKEN()}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(payload),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: d.message || `http_${r.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function sendDueReminders(): Promise<void> {
  const base = (process.env.PORTAL_BASE_URL || "").replace(/\/$/, "");
  const { rows } = await q<{ id: string; label: string; phone: string | null; first: string }>(
    `SELECT r.id, r.label, u.phone,
            COALESCE(NULLIF(split_part(u.display_name,' ',1),''), 'there') AS first
     FROM ${ah("portal_reminders")} r JOIN ${ah("portal_users")} u ON u.id = r.user_id
     WHERE r.send_on <= CURRENT_DATE AND r.sent_at IS NULL AND r.canceled_at IS NULL
     LIMIT 50`);

  for (const r of rows) {
    let result = "sent";
    if (!r.phone) result = "no_phone";
    else {
      const link = base ? ` ${base}/portal/documents` : "";
      const sms = await sendSms(r.phone,
        `Hi ${r.first} — Texas Tech Online here. You planned to finish "${r.label}" today. Knock it out in your portal to stay on track.${link} Reply STOP to opt out.`);
      if (!sms.ok) result = sms.error === "no_twilio" ? "no_twilio" : "error";
      if (result === "error") { console.warn(`[reminders] send failed for ${r.id}: ${sms.error}`); continue; } // retry next tick
    }
    await q(`UPDATE ${ah("portal_reminders")} SET sent_at=now(), result=$2 WHERE id=$1`, [r.id, result]);
  }
  if (rows.length) console.log(`[reminders] processed ${rows.length} due reminder(s)`);
}
