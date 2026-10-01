import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { botReply } from "@/lib/bot";

export async function GET(req: NextRequest) {
  const user = await requireApiUser();
  if (isResp(user)) return user;
  const after = Number(req.nextUrl.searchParams.get("after") || 0);

  const thread = (await q(
    `SELECT * FROM ${ah("portal_chat_threads")} WHERE user_id=$1 AND status != 'closed' ORDER BY created_at DESC LIMIT 1`,
    [user.id])).rows[0];
  if (!thread) return json({ thread: null, messages: [] });

  const { rows } = await q(
    `SELECT id, sender_kind, body, created_at FROM ${ah("portal_chat_messages")}
     WHERE thread_id=$1 AND id > $2 ORDER BY id`, [thread.id, after]);
  return json({ thread, messages: rows });
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser(["student"]);
  if (isResp(user)) return user;
  const { body } = await req.json();
  if (!body?.trim()) return bad("Empty message");

  let thread = (await q<{ id: string; claimed_by: string | null }>(
    `SELECT id, claimed_by FROM ${ah("portal_chat_threads")} WHERE user_id=$1 AND status != 'closed' ORDER BY created_at DESC LIMIT 1`,
    [user.id])).rows[0];
  if (!thread) {
    thread = (await q<{ id: string; claimed_by: string | null }>(
      `INSERT INTO ${ah("portal_chat_threads")} (user_id, subject) VALUES ($1,$2) RETURNING id, claimed_by`,
      [user.id, body.slice(0, 80)])).rows[0];
  }

  await q(`INSERT INTO ${ah("portal_chat_messages")} (thread_id, sender_id, sender_kind, body) VALUES ($1,$2,'student',$3)`,
    [thread.id, user.id, body.trim()]);
  await q(`UPDATE ${ah("portal_chat_threads")} SET updated_at=now() WHERE id=$1`, [thread.id]);

  // bot auto-reply while unclaimed
  if (!thread.claimed_by) {
    const reply = await botReply(body, { name: user.display_name ?? undefined, email: user.email });
    await q(`INSERT INTO ${ah("portal_chat_messages")} (thread_id, sender_kind, body) VALUES ($1,'bot',$2)`, [thread.id, reply]);
    await q(`UPDATE ${ah("portal_chat_threads")} SET updated_at=now() WHERE id=$1`, [thread.id]);
  }

  return json({ ok: true, threadId: thread.id });
}
