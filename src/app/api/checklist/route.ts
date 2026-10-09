import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { studentChecklist } from "@/lib/checklist";

// Student checklist — shared logic lives in src/lib/checklist.ts so /api/me and
// the dashboard see the same merged state this endpoint returns.
export async function GET() {
  const user = await requireApiUser();
  if (isResp(user)) return user;
  const cl = await studentChecklist(user.id);
  const { rows: reminders } = await q<{ item_ref: string; send_on: string }>(
    `SELECT item_ref, send_on::text FROM ${ah("portal_reminders")}
     WHERE user_id=$1 AND sent_at IS NULL AND canceled_at IS NULL`, [user.id]);
  return json({ ...cl, reminders, applyEnabled: process.env.APPLY_ENABLED === "true" });
}

// Student marks an item in_progress / submitted (document-linked items flip to
// submitted on upload) — or schedules/cancels a reminder for one open item.
export async function POST(req: NextRequest) {
  const user = await requireApiUser(["student"]);
  if (isResp(user)) return user;
  const body = await req.json();

  if (body.action === "remind" || body.action === "cancel_reminder") {
    const itemId = String(body.item_id ?? "");
    const cl = await studentChecklist(user.id);
    const item = cl.items.find((i) => i.id === itemId);
    if (!item || ["approved", "waived"].includes(item.status)) return bad("item not found", 404);

    if (body.action === "cancel_reminder") {
      await q(`UPDATE ${ah("portal_reminders")} SET canceled_at=now()
               WHERE user_id=$1 AND item_ref=$2 AND sent_at IS NULL`, [user.id, itemId]);
      return json({ ok: true });
    }

    const sendOn = new Date(body.send_on);
    if (!(sendOn instanceof Date) || isNaN(sendOn.getTime())) return bad("bad date");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const max = new Date(today); max.setDate(max.getDate() + 90);
    if (sendOn < today || sendOn > max) return bad("pick a day within 90 days");
    if (!body.confirm_sms) return bad("sms consent required");
    const { rows: u } = await q<{ phone: string | null }>(
      `SELECT phone FROM ${ah("portal_users")} WHERE id=$1`, [user.id]);
    if (!u[0]?.phone) return bad("add a phone number in Profile first");

    // one active reminder per item — reschedule = replace
    await q(`UPDATE ${ah("portal_reminders")} SET canceled_at=now()
             WHERE user_id=$1 AND item_ref=$2 AND sent_at IS NULL`, [user.id, itemId]);
    await q(`INSERT INTO ${ah("portal_reminders")} (user_id, item_ref, label, send_on)
             VALUES ($1,$2,$3,$4)`, [user.id, itemId, item.label, sendOn.toISOString().slice(0, 10)]);
    await audit(req, user, "action", { action: "reminder_set", item: itemId, send_on: body.send_on });
    return json({ ok: true });
  }

  const { id, status } = body;
  if (!["in_progress", "submitted", "not_started"].includes(status)) return bad("bad status");
  const { rowCount } = await q(
    `UPDATE ${ah("portal_checklist_items")} SET status=$3, updated_at=now()
     WHERE id=$1 AND user_id=$2 AND status NOT IN ('approved','waived')`,
    [id, user.id, status]);
  if (!rowCount) return bad("Item not found or locked", 404);
  await audit(req, user, "action", { action: "checklist_update", item: id, status });
  return json({ ok: true });
}
