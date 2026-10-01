import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";

// SF outbox: changes a superadmin must apply to Salesforce by hand
export async function GET(req: NextRequest) {
  const user = await requireApiUser(["admin"]);
  if (isResp(user)) return user;
  const status = req.nextUrl.searchParams.get("status") || "pending";
  const { rows } = await q(
    `SELECT o.*, a.display_name AS actor, d.display_name AS done_by_name
     FROM ${ah("portal_outbox")} o
     LEFT JOIN ${ah("portal_users")} a ON a.id=o.actor_id
     LEFT JOIN ${ah("portal_users")} d ON d.id=o.done_by
     ${status === "all" ? "" : "WHERE o.status=$1"} ORDER BY o.created_at DESC LIMIT 200`,
    status === "all" ? [] : [status]);
  return json({ items: rows });
}

export async function POST(req: NextRequest) {
  const user = await requireApiUser(["admin"]);
  if (isResp(user)) return user;
  const { id, done, note } = await req.json();
  if (!id) return bad("id required");
  await q(`UPDATE ${ah("portal_outbox")} SET status=$2, done_by=$3, done_at=now(), note=COALESCE($4,note) WHERE id=$1`,
    [id, done ? "done" : "skipped", user.id, note ?? null]);
  await audit(req, user, "admin_action", { action: done ? "outbox_done" : "outbox_skip", id });
  return json({ ok: true });
}
