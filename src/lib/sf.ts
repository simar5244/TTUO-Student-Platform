// Reads the AH.sf_* clone (refreshed by lib/sync.ts every 5–30 min).
// Nothing here touches sf_origin at request time — only sync.ts does.
import { q, ah, sf, whPool } from "./db";
import { normalizePhone } from "./auth";

export interface SfContact {
  Id: string;
  Name: string | null;
  FirstName: string | null;
  LastName: string | null;
  Email: string | null;
  Phone: string | null;
  MobilePhone: string | null;
  emails: string[];
  phones: string[];
  pref_first: string | null;
  nickname: string | null;
  former_last: string | null;
  status: string | null;
  record_type: string | null;
  lead_source: string | null;
  term: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  created: Date | null;
  banner_id: string | null;
}

const CONTACT_SELECT = `
  c.id AS "Id", c.name AS "Name", c.first_name AS "FirstName", c.last_name AS "LastName",
  c.email AS "Email", c.phone AS "Phone", c.mobile_phone AS "MobilePhone",
  c.emails, c.phones, c.pref_first, c.nickname, c.former_last,
  c.status, c.record_type, c.lead_source, c.term,
  c.street, c.city, c.state, c.zip,
  c.sf_created AS created, c.banner_id
  FROM ${ah("sf_contact")} c`;

export async function findContactById(id: string): Promise<SfContact | null> {
  const { rows } = await q<SfContact>(`SELECT ${CONTACT_SELECT} WHERE c.id = $1`, [id]);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Identity matching. The portal knows {email, phone, name} about a signup;
// the clone knows every email/phone/name variant Salesforce ever saw.
//
// Confidence (0–100): email 40 · phone 35 · last name (incl. former) 15 ·
// first name (incl. preferred/nickname) 10.
//   email+phone            → auto link
//   any partial ≥ PENDING  → review queue
//   below                  → unlinked (candidates still shown to staff)
// SF mailing address is shown to the reviewer as context but isn't scored —
// the portal doesn't collect one yet.
// ---------------------------------------------------------------------------
export const MATCH_WEIGHTS = { email: 40, phone: 35, last_name: 15, first_name: 10 } as const;
export const PENDING_MIN = 35; // lowest score that queues for human review

export interface MatchFields {
  email: boolean;
  phone: boolean;
  last_name: boolean;
  first_name: boolean;
}
export interface ScoredCandidate {
  contact: SfContact;
  fields: MatchFields;
  confidence: number;
}

export function splitName(name: string | null | undefined): { first: string; last: string } {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Field-level comparison between a portal user and one cloned contact. */
export function scoreFields(
  u: { email: string; phone?: string | null; first?: string; last?: string },
  c: SfContact
): { fields: MatchFields; confidence: number } {
  const digits = normalizePhone(u.phone);
  const fields: MatchFields = {
    email: !!u.email && (c.emails ?? []).includes(u.email.trim().toLowerCase()),
    phone: !!digits && (c.phones ?? []).includes(digits),
    last_name: !!u.last && (eq(u.last, c.LastName) || eq(u.last, c.former_last)),
    first_name: !!u.first && (eq(u.first, c.FirstName) || eq(u.first, c.pref_first) || eq(u.first, c.nickname)),
  };
  const confidence =
    (fields.email ? MATCH_WEIGHTS.email : 0) +
    (fields.phone ? MATCH_WEIGHTS.phone : 0) +
    (fields.last_name ? MATCH_WEIGHTS.last_name : 0) +
    (fields.first_name ? MATCH_WEIGHTS.first_name : 0);
  return { fields, confidence };
}

/**
 * Candidate discovery + scoring. Any single-field hit makes a contact a
 * candidate (a lone last-name hit included — people sign up with different
 * emails all the time); scoring decides what happens next.
 */
export async function scoreCandidates(u: {
  email: string; phone?: string | null; first?: string; last?: string;
}): Promise<ScoredCandidate[]> {
  const digits = normalizePhone(u.phone);
  const first = (u.first ?? "").trim().toLowerCase();
  const last = (u.last ?? "").trim().toLowerCase();
  const { rows } = await q<SfContact>(
    `SELECT ${CONTACT_SELECT}
      WHERE (NULLIF($1,'') IS NOT NULL AND lower($1) = ANY(c.emails))
         OR (NULLIF($2,'') IS NOT NULL AND $2 = ANY(c.phones))
         OR (NULLIF($3,'') IS NOT NULL AND
             (lower(c.last_name) = $3 OR lower(c.former_last) = $3))
         OR (NULLIF($4,'') IS NOT NULL AND
             (lower(c.first_name) = $4 OR lower(c.pref_first) = $4 OR lower(c.nickname) = $4))
      LIMIT 200`,
    [(u.email || "").trim().toLowerCase(), digits, last, first]
  );
  return rows
    .map((c) => ({ contact: c, ...scoreFields(u, c) }))
    .filter((c) => c.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// Lists for staff screens (all served from the clone).
// ---------------------------------------------------------------------------
export async function listLeads(opts: {
  search?: string; status?: string; term?: string; source?: string;
  recordType?: string; page?: number; perPage?: number;
}) {
  const where: string[] = ["c.record_type IN ('Prospective Student','International','Degree Completion')"];
  const params: unknown[] = [];
  const add = (v: string) => { params.push(v); return `$${params.length}`; };
  if (opts.search) {
    const p = add(`%${opts.search}%`);
    where.push(`(c.name ILIKE ${p} OR c.email ILIKE ${p} OR c.mobile_phone ILIKE ${p})`);
  }
  if (opts.status) where.push(`c.status = ${add(opts.status)}`);
  if (opts.term) where.push(`c.term = ${add(opts.term)}`);
  if (opts.source) where.push(`c.lead_source = ${add(opts.source)}`);
  if (opts.recordType) where.push(`c.record_type = ${add(opts.recordType)}`);
  const perPage = Math.min(opts.perPage ?? 25, 100);
  const page = Math.max(opts.page ?? 1, 1);
  const countQ = q<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${ah("sf_contact")} c WHERE ${where.join(" AND ")}`, params);
  const listQ = q<SfContact>(
    `SELECT ${CONTACT_SELECT} WHERE ${where.join(" AND ")}
     ORDER BY c.sf_created DESC NULLS LAST LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`, params);
  const [c, l] = await Promise.all([countQ, listQ]);
  return { total: c.rows[0]?.n ?? 0, rows: l.rows, page, perPage };
}

export async function listApplications(opts: {
  search?: string; stage?: string; status?: string; term?: string; recordType?: string;
  page?: number; perPage?: number;
}) {
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  const add = (v: string) => { params.push(v); return `$${params.length}`; };
  if (opts.search) {
    const p = add(`%${opts.search}%`);
    where.push(`(c.name ILIKE ${p} OR c.email ILIKE ${p} OR a.app_number ILIKE ${p})`);
  }
  if (opts.stage) where.push(`a.stage = ${add(opts.stage)}`);
  if (opts.status) where.push(`a.status = ${add(opts.status)}`);
  if (opts.term) where.push(`a.term = ${add(opts.term)}`);
  if (opts.recordType) where.push(`a.record_type = ${add(opts.recordType)}`);
  const from = `FROM ${ah("sf_application")} a
     LEFT JOIN ${ah("sf_contact")} c ON c.id = a.contact_id`;
  const perPage = Math.min(opts.perPage ?? 25, 100);
  const page = Math.max(opts.page ?? 1, 1);
  const countQ = q<{ n: number }>(`SELECT count(*)::int AS n ${from} WHERE ${where.join(" AND ")}`, params);
  const listQ = q(
    `SELECT a.id AS "Id", a.app_number, a.record_type, a.stage, a.status, a.term,
            a.submitted, a.sf_created AS created, a.program_id, a.program_name,
            c.id AS contact_id, c.name AS student, c.email,
            c.mobile_phone AS phone, c.status AS contact_status
     ${from} WHERE ${where.join(" AND ")}
     ORDER BY a.sf_created DESC NULLS LAST LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
    params);
  const [c2, l] = await Promise.all([countQ, listQ]);
  return { total: c2.rows[0]?.n ?? 0, rows: l.rows, page, perPage };
}

export async function getApplication(id: string) {
  const { rows } = await q(
    `SELECT a.*, c.name AS student, c.email, c.id AS contact_id
     FROM ${ah("sf_application")} a
     LEFT JOIN ${ah("sf_contact")} c ON c.id = a.contact_id
     WHERE a.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function contactApplications(contactId: string) {
  const { rows } = await q(
    `SELECT a.id AS "Id", a.app_number, a.record_type, a.stage, a.status, a.term,
            a.submitted, a.program_name, a.sf_created AS created,
            a.open_checklist, a.checklist_total, a.checklist_done, a.pct_complete,
            a.app_state, a.decision, a.decision_display, a.campus, a.level,
            a.completed_date, a.items_received_date, a.fee_received
     FROM ${ah("sf_application")} a
     WHERE a.contact_id = $1 ORDER BY a.sf_created DESC`, [contactId]);
  return rows;
}

// ---------------------------------------------------------------------------
// Per-item checklist — clone of AH.checklist_items (TargetX checklist object).
// "done" = SF closed the item, waived it, marked not-required, received the
// document, or set a satisfying status.
// ---------------------------------------------------------------------------
export interface SfChecklistItem {
  id: string;
  name: string | null;
  application_id: string | null;
  status: string | null;
  req_code: string | null;
  item_received: string | null;
  description: string | null;
  long_description: string | null;
  assigned: boolean | null;
  is_closed: boolean | null;
  waived: boolean | null;
  not_required: boolean | null;
  related_to: string | null;
  sf_modified: Date | null;
  done: boolean;
}

export const CHECKLIST_DONE = `(
  is_closed OR waived OR not_required
  OR status ~* 'received|complete|approved|waived|satisfied'
  OR NULLIF(item_received,'') IS NOT NULL
)`;

export async function checklistForApplication(appId: string): Promise<SfChecklistItem[]> {
  const { rows } = await q<SfChecklistItem>(
    `SELECT id, name, application_id, status, req_code, item_received, description,
            long_description, assigned, is_closed, waived, not_required, related_to,
            sf_modified, ${CHECKLIST_DONE} AS done
     FROM ${ah("sf_checklist_item")}
     WHERE application_id = $1 AND NOT COALESCE(is_deleted, false)
     ORDER BY name`, [appId]);
  return rows;
}

export async function checklistSummary(appId: string) {
  const { rows } = await q<{ done: number; total: number; open_items: SfChecklistItem[] }>(
    `SELECT count(*) FILTER (WHERE ${CHECKLIST_DONE})::int AS done,
            count(*)::int AS total
     FROM ${ah("sf_checklist_item")}
     WHERE application_id = $1 AND NOT COALESCE(is_deleted, false)`, [appId]);
  return rows[0] ?? { done: 0, total: 0 };
}

// ---------------------------------------------------------------------------
// Broad contact search — reads the warehouse contact table directly (not the
// slice). Admin/manager only, for the "no candidates" lane of the match queue:
// a student whose lead record was never tagged Distance Learning still needs
// to be findable. Bounded + read-only.
// ---------------------------------------------------------------------------
export async function searchWarehouseContacts(term: string, limit = 50) {
  const t = `%${term.trim()}%`;
  const digits = normalizePhone(term);
  const { rows } = await whPool().query(
    `SELECT c."Id" AS "Id", c."Name" AS "Name", c."FirstName" AS "FirstName",
            c."LastName" AS "LastName", c."Email" AS "Email", c."Phone" AS "Phone",
            c."MobilePhone" AS "MobilePhone",
            c."TargetX_SRMb__Status__c" AS status, rt."Name" AS record_type,
            c."LeadSource" AS lead_source, c."MailingCity" AS city, c."MailingState" AS state,
            c."CreatedDate" AS created
     FROM ${sf("contact")} c LEFT JOIN ${sf("recordtype")} rt ON rt."Id" = c."RecordTypeId"
     WHERE c."Name" ILIKE $1 OR c."Email" ILIKE $1
        OR (NULLIF($2,'') IS NOT NULL AND
            (c."Phone" ~ $2 OR c."MobilePhone" ~ $2))
     ORDER BY c."CreatedDate" DESC NULLS LAST LIMIT $3`,
    [t, digits.length >= 7 ? digits : "", limit]
  );
  return rows;
}

/** An admin manually linked a contact outside the clone slice — pull a minimal
 *  row from the warehouse so the link still renders everywhere. row_hash stays
 *  'manual' until a real sync refreshes it (it'll re-hash then). */
export async function ensureCloned(contactId: string) {
  const { rows } = await whPool().query(
    `SELECT c."Id" AS id, c."Name" AS name, c."FirstName" AS first_name, c."LastName" AS last_name,
            c."TTU_Preferred_First_Name__c" AS pref_first, c."Email" AS email,
            c."Phone" AS phone, c."MobilePhone" AS mobile_phone,
            c."TargetX_SRMb__Status__c" AS status, r."Name" AS record_type,
            c."LeadSource" AS lead_source, c."TargetX_SRMb__Anticipated_Start_Term__c" AS term,
            c."MailingStreet" AS street, c."MailingCity" AS city, c."MailingState" AS state,
            c."MailingPostalCode" AS zip, c."TargetX_SRMb__BannerID__c" AS banner_id,
            c."CreatedDate" AS sf_created, c."SystemModstamp" AS sf_modified
     FROM ${sf("contact")} c LEFT JOIN ${sf("recordtype")} r ON r."Id" = c."RecordTypeId"
     WHERE c."Id" = $1`, [contactId]);
  const r = rows[0];
  if (!r) return false;
  const emails = [...new Set([r.email].map((e: string) => (typeof e === "string" ? e.trim().toLowerCase() : "")).filter(Boolean))];
  const phones = [...new Set([r.phone, r.mobile_phone].map((p: string) => normalizePhone(typeof p === "string" ? p : "")).filter((d: string) => d.length >= 7))];
  await q(
    `INSERT INTO ${ah("sf_contact")} (id, name, first_name, last_name, pref_first, email, emails,
       phone, mobile_phone, phones, status, record_type, lead_source, term,
       street, city, state, zip, banner_id, sf_created, sf_modified, row_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'manual')
     ON CONFLICT (id) DO NOTHING`,
    [r.id, r.name, r.first_name, r.last_name, r.pref_first, r.email, emails,
     r.phone, r.mobile_phone, phones, r.status, r.record_type, r.lead_source, r.term,
     r.street, r.city, r.state, r.zip, r.banner_id, r.sf_created, r.sf_modified]);
  return true;
}

export const listTerms = () =>
  q(`SELECT id, name FROM ${ah("sf_term")} ORDER BY start_date DESC NULLS LAST`);

export const listPrograms = (onlineOnly = true) =>
  q(`SELECT id, name, degree, college
     FROM ${ah("sf_program")} ${onlineOnly ? "WHERE is_online" : ""} ORDER BY name`);

export const listDistinct = (col: string, table = "sf_contact") =>
  q<{ v: string }>(`SELECT DISTINCT "${col}" AS v FROM ${ah(table)} WHERE "${col}" IS NOT NULL AND "${col}" <> '' ORDER BY 1 LIMIT 200`);

export async function funnelStats() {
  const { rows } = await q(
    `SELECT status, count(*)::int AS n FROM ${ah("sf_contact")} GROUP BY 1 ORDER BY 2 DESC`);
  return rows;
}
