import { NextRequest } from "next/server";
import { requireApiUser, isResp, json, bad, audit } from "@/lib/api";
import { q, ah } from "@/lib/db";
import { checklistForApplication } from "@/lib/sf";

// Student checklist. Source of truth order:
//   1. SF checklist items on their detected/linked application (real state —
//      RaiderConnect uploads flip these rows)
//   2. local portal_checklist_items (fallback while the SF pipe is empty)
//   3. nothing + a General Business intent -> requirements still pending
// Portal uploads overlay items: a pending_review/pushed document against a req
// shows the item as submitted-with-us until SF confirms receipt (approved).
export async function GET() {
  const user = await requireApiUser();
  if (isResp(user)) return user;

  const link = (await q<{ sf_contact_id: string | null }>(
    `SELECT sf_contact_id FROM ${ah("portal_identity_links")}
     WHERE user_id=$1 AND status IN ('active','confirmed') AND sf_contact_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`, [user.id])).rows[0];

  const portalApp = (await q<{ id: string; sf_application_id: string | null; rc_program: string | null; program_name: string | null; status: string }>(
    `SELECT id, sf_application_id, rc_program, program_name, status
     FROM ${ah("portal_applications")} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [user.id])).rows[0];

  const sfAppId = portalApp?.sf_application_id ??
    (link?.sf_contact_id
      ? (await q<{ id: string }>(
          `SELECT id FROM ${ah("sf_application")} WHERE contact_id=$1
           ORDER BY sf_created DESC NULLS LAST LIMIT 1`, [link.sf_contact_id])).rows[0]?.id
      : null);

  // uploads already sent to us, keyed by SF item / req code for overlay
  const docs = (await q<{ sf_item_id: string | null; req_key: string | null; status: string; checklist_item_id: string | null }>(
    `SELECT sf_item_id, req_key, status, checklist_item_id FROM ${ah("portal_documents")}
     WHERE user_id=$1 AND status IN ('pending_review','pushed')`, [user.id])).rows;
  const docFor = (sfItemId: string | null, reqKey: string | null, localId: string | null) =>
    docs.find((d) =>
      (sfItemId && d.sf_item_id === sfItemId) ||
      (reqKey && d.req_key === reqKey) ||
      (localId && d.checklist_item_id === localId));

  if (sfAppId) {
    const sfItems = await checklistForApplication(sfAppId);
    if (sfItems.length) {
      return json({
        source: "sf",
        applicationId: sfAppId,
        items: sfItems.map((i) => {
          const d = docFor(i.id, i.req_code, null);
          return {
            id: i.id, key: i.req_code ?? i.id, label: i.name ?? "Requirement",
            required: !i.not_required, sf: true,
            status: i.done ? "approved" : d ? (d.status === "pushed" ? "pushed" : "submitted") : "not_started",
            note: null, description: i.long_description || i.description,
            sf_status: i.status, item_received: i.item_received, docs: d ? 1 : 0,
          };
        }),
      });
    }
  }

  // local fallback rows
  const { rows } = await q(
    `SELECT ci.*, (SELECT count(*)::int FROM ${ah("portal_documents")} d WHERE d.checklist_item_id = ci.id) AS docs
     FROM ${ah("portal_checklist_items")} ci WHERE ci.user_id=$1 ORDER BY ci.sort_order`, [user.id]);
  if (rows.length) return json({ source: "local", items: rows });

  const gb = /general business/i.test(portalApp?.rc_program ?? portalApp?.program_name ?? "");
  return json({
    source: "none",
    items: [],
    pending: gb
      ? "General Business requirements are still being finalized — we'll populate your checklist as soon as your Salesforce application lands."
      : null,
  });
}

// Student marks an item in_progress / submitted (document-linked items flip to submitted on upload)
export async function POST(req: NextRequest) {
  const user = await requireApiUser(["student"]);
  if (isResp(user)) return user;
  const { id, status } = await req.json();
  if (!["in_progress", "submitted", "not_started"].includes(status)) return bad("bad status");
  const { rowCount } = await q(
    `UPDATE ${ah("portal_checklist_items")} SET status=$3, updated_at=now()
     WHERE id=$1 AND user_id=$2 AND status NOT IN ('approved','waived')`,
    [id, user.id, status]);
  if (!rowCount) return bad("Item not found or locked", 404);
  await audit(req, user, "action", { action: "checklist_update", item: id, status });
  return json({ ok: true });
}
