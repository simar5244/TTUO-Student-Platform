import { q, ah } from "./db";
import { checklistForApplication } from "./sf";

export interface ChecklistItemView {
  id: string;
  key: string;
  label: string;
  required: boolean;
  sf: boolean;
  status: string;
  note: string | null;
  description: string | null;
  sf_status?: string | null;
  item_received?: string | null;
  docs: number;
}

export interface StudentChecklist {
  source: "sf" | "local" | "none";
  applicationId?: string | null;
  items: ChecklistItemView[] | any[];
  pending?: string | null;
}

// The student's real checklist. Source order:
//   1. SF checklist items on their linked/detected application (RaiderConnect
//      uploads flip these — synced every SYNC_INTERVAL_MINUTES)
//   2. local portal_checklist_items (fallback while no SF app exists)
//   3. empty + a General Business intent -> requirements still pending
// Portal uploads overlay SF items: pending_review/pushed shows "submitted with
// us" until sync sees the SF item closed (then it reads approved).
// Endowed progress (Nunes & Drèze 2006): the list never starts empty — the
// steps the student has already finished (account, submitted application) are
// real checklist items, so a returning user sees momentum, not a blank slate.
function metaItems(portalApp?: { status: string } | null, sfAppId?: string | null): ChecklistItemView[] {
  const appDone = !!sfAppId || portalApp?.status === "submitted";
  return [
    { id: "meta-account", key: "account", label: "Create your account", required: true, sf: false,
      status: "approved", note: null, description: null, docs: 0 },
    { id: "meta-application", key: "application", label: "Submit your application on RaiderConnect",
      required: true, sf: false,
      status: appDone ? "approved" : portalApp ? "in_progress" : "not_started",
      note: null, description: null, docs: 0 },
  ];
}

export async function studentChecklist(userId: string): Promise<StudentChecklist> {
  const link = (await q<{ sf_contact_id: string | null }>(
    `SELECT sf_contact_id FROM ${ah("portal_identity_links")}
     WHERE user_id=$1 AND status IN ('active','confirmed') AND sf_contact_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`, [userId])).rows[0];

  const portalApp = (await q<{ id: string; sf_application_id: string | null; rc_program: string | null; program_name: string | null; status: string }>(
    `SELECT id, sf_application_id, rc_program, program_name, status
     FROM ${ah("portal_applications")} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [userId])).rows[0];

  const sfAppId = portalApp?.sf_application_id ??
    (link?.sf_contact_id
      ? (await q<{ id: string }>(
          `SELECT id FROM ${ah("sf_application")} WHERE contact_id=$1
           ORDER BY sf_created DESC NULLS LAST LIMIT 1`, [link.sf_contact_id])).rows[0]?.id
      : null);

  const docs = (await q<{ sf_item_id: string | null; req_key: string | null; status: string; checklist_item_id: string | null }>(
    `SELECT sf_item_id, req_key, status, checklist_item_id FROM ${ah("portal_documents")}
     WHERE user_id=$1 AND status IN ('pending_review','pushed')`, [userId])).rows;
  const docFor = (sfItemId: string | null, reqKey: string | null, localId: string | null) =>
    docs.find((d) =>
      (sfItemId && d.sf_item_id === sfItemId) ||
      (reqKey && d.req_key === reqKey) ||
      (localId && d.checklist_item_id === localId));

  if (sfAppId) {
    const sfItems = await checklistForApplication(sfAppId);
    if (sfItems.length) {
      return {
        source: "sf",
        applicationId: sfAppId,
        items: [...metaItems(portalApp, sfAppId), ...sfItems.map((i) => {
          const d = docFor(i.id, i.req_code, null);
          return {
            id: i.id, key: i.req_code ?? i.id, label: i.name ?? "Requirement",
            required: !i.not_required, sf: true,
            status: i.done ? "approved" : d ? (d.status === "pushed" ? "pushed" : "submitted") : "not_started",
            note: null, description: i.long_description || i.description,
            sf_status: i.status, item_received: i.item_received, docs: d ? 1 : 0,
          };
        })],
      };
    }
  }

  const { rows } = await q(
    `SELECT ci.*, (SELECT count(*)::int FROM ${ah("portal_documents")} d WHERE d.checklist_item_id = ci.id) AS docs
     FROM ${ah("portal_checklist_items")} ci WHERE ci.user_id=$1 ORDER BY ci.sort_order`, [userId]);
  if (rows.length) return { source: "local", items: [...metaItems(portalApp, sfAppId), ...rows] };

  const gb = /general business/i.test(portalApp?.rc_program ?? portalApp?.program_name ?? "");
  return {
    source: "none",
    items: metaItems(portalApp, sfAppId),
    pending: gb
      ? "General Business requirements are still being finalized — we'll populate your checklist as soon as your Salesforce application lands."
      : null,
  };
}

export function checklistCounts(items: any[]) {
  const required = items.filter((i) => i.required !== false);
  const done = required.filter((i) => ["approved", "waived"].includes(i.status)).length;
  return { done, total: required.length, pct: required.length ? Math.round((done / required.length) * 100) : 0 };
}
