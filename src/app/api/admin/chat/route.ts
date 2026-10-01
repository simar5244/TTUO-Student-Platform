import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";

const ROLES = ["advisor", "manager", "admin"] as const;

// GET ?thread=<id>&after=<n> -> messages;  no thread -> open thread list
export async function GET(req: NextRequest) {
  const user = await requireApiUser([...ROLES]);
  if (isResp(user)) return user;
  const threadId = req.nextUrl.searchParams.get("thread");
  const after = Number(req.nextUrl.searchParams.get("after") || 0);

  if (!threadId) {
    const { rows } = await q(
      `SELECT t.*, u.email, u.display_name,
              (SELECT body FROM ${ah("portal_chat_messages")} m WHERE m.thread_id=t.id ORDER BY id DESC LIMIT 1) AS last_msg,
              (SELECT count(*)::int FROM ${ah("portal_chat_messages")} m WHERE m.thread_id=t.id) AS msg_count
       FROM ${ah("portal_chat_threads")} t JOIN ${ah("portal_users")} u ON u.id=t.user_id
       WHERE t.status != 'closed' ORDER BY t.updated_at DESC LIMIT 100`);
    return json({ threads: rows });
  }
  const thread = (await q(
    `SELECT t.*, u.email, u.display_name FROM ${ah("portal_chat_threads")} t JOIN ${ah("portal_users")} u ON u.id=t.user_id WHERE t.id=$1`,
    [threadId])).rows[0];
  const { rows } = await q(
    `SELECT id, sender_kind, body, created_at FROM ${ah("portal_chat_messages")} WHERE thread_id=$1 AND id>$2 ORDER BY id`,
    [threadId, after]);
  return json({ thread, messages: rows });
}

// POST {thread, body} reply | {thread, op:'claim'|'close'|'reopen'}
export async function POST(req: NextRequest) {
  const user = await requireApiUser([...ROLES]);
  if (isResp(user)) return user;
  const { thread, body, op } = await req.json();
  if (!thread) return bad("thread required");

  if (op === "claim") {
    await q(`UPDATE ${ah("portal_chat_threads")} SET status='claimed', claimed_by=$2, updated_at=now() WHERE id=$1`, [thread, user.id]);
  } else if (op === "close" || op === "reopen") {
    await q(`UPDATE ${ah("portal_chat_threads")} SET status=$2, updated_at=now() WHERE id=$1`, [thread, op === "close" ? "closed" : "open"]);
  } else if (body?.trim()) {
    // replying auto-claims
    await q(`INSERT INTO ${ah("portal_chat_messages")} (thread_id, sender_id, sender_kind, body) VALUES ($1,$2,'admin',$3)`, [thread, user.id, body.trim()]);
    await q(`UPDATE ${ah("portal_chat_threads")} SET status='claimed', claimed_by=COALESCE(claimed_by,$2), updated_at=now() WHERE id=$1`, [thread, user.id]);
    await audit(req, user, "admin_action", { action: "chat_reply", thread });
  } else return bad("nothing to do");

  return json({ ok: true });
}
