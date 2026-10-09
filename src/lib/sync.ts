// Sync engine: clones the TTU-Online slice of sf_origin into AH.sf_* tables.
//
//   - runs every SYNC_INTERVAL_MINUTES (5–30, default 15; 0 disables), once at
//     boot if the clone is empty/stale, and on demand from /admin/sync
//   - pg advisory lock guarantees a run never overlaps itself
//   - clone rows are upserted by SF Id; any row whose content hash changed is
//     ALSO appended to the append-only *_hist tables — no state is ever lost
//   - after each run, portal_contact_projection is rebuilt: the generated
//     columns that stitch each linked SF contact to its portal-side state
//
// The clone is append-only by policy: rows that fall out of the slice are kept
// (they still matter for matching and person-360), they just stop refreshing.
import { PoolClient } from "pg";
import { q, ah, sf, appPool, whPool } from "./db";
import { normalizePhone } from "./auth";

const LOCK_KEY = 727272;
const PAGE = 20_000;      // ids per hash-scan page
const CHUNK = 500;        // rows per upsert batch

export type SyncTrigger = "schedule" | "manual" | "boot";

export function syncIntervalMinutes(): number {
  const n = parseInt(process.env.SYNC_INTERVAL_MINUTES || "15", 10);
  if (n === 0) return 0; // disabled
  return Math.min(Math.max(Number.isFinite(n) ? n : 15, 5), 30);
}

// ---------------------------------------------------------------------------
// What gets cloned: the TTU-Online slice. One predicate on sf_origin.contact.
// Measured on prod (3.6M contacts, 2026-10-09): ~76.5K rows.
//   • Campus_Inquiry__c = 'Distance Learning'   (the online-lead universe)
//   • TTU_Online_Student__c flag                • TTU Online campus code
//   • online lead sources                       • owns a TTU Online application
// NOTE: never slice on "<field> IS NOT NULL" here — SF fields sync back as ''
// empty strings, so IS NOT NULL matches ~every row (learned the hard way).
// ---------------------------------------------------------------------------
const CONTACT_SLICE = (a: string) => `(
    ${a}."Campus_Inquiry__c" = 'Distance Learning'
    OR ${a}."TTU_Online_Student__c" IS TRUE
    OR ${a}."LeadSource" IN ('TTU Online Community','STUTTORFI','TTUOSE')
    OR ${a}."TargetX_SRMb__Campus__c" = 'TUO'
    OR EXISTS (
      SELECT 1 FROM ${sf("application")} xa
      JOIN ${sf("recordtype")} xr ON xr."Id" = xa."RecordTypeId"
      WHERE xa."TargetX_SRMb__Contact__c" = ${a}."Id" AND xr."Name" = 'TTU Online')
  )`;

// ---------------------------------------------------------------------------
// Column maps. cloneCols = AH columns (synced_at appended automatically).
// sel = source-side SELECT list (aliases match cloneCols). hashOf = source
// expressions hashed to detect changes.
// ---------------------------------------------------------------------------
interface TableSpec {
  clone: "sf_contact" | "sf_application" | "sf_checklist_item";
  cols: string[];
  sel: string;                 // SELECT list (source side)
  from: string;                // FROM + JOINs (source side)
  where: string;               // slice predicate
  hashCols: string[];          // source expressions for the content hash
  map: (r: Record<string, unknown>) => unknown[];
}

const CONTACT: TableSpec = {
  clone: "sf_contact",
  cols: [
    "id", "name", "first_name", "last_name", "pref_first", "nickname", "former_last",
    "email", "emails", "phone", "mobile_phone", "phones",
    "status", "record_type", "lead_source", "term",
    "street", "city", "state", "zip", "banner_id",
    "online_student", "is_duplicate", "sf_created", "sf_modified", "row_hash",
  ],
  sel: `
    c."Id" AS id, c."Name" AS name, c."FirstName" AS first_name, c."LastName" AS last_name,
    c."TTU_Preferred_First_Name__c" AS pref_first, c."Alias_Nickname__c" AS nickname,
    coalesce(c."TargetX_SRMb__Former_Last_Name__c", c."hed__Former_Last_Name__c") AS former_last,
    c."Email" AS email,
    c."TargetX_Email__AltEmail__c" AS alt_email, c."TTU_Email_Address__c" AS ttu_email,
    c."TTU_Permanent_Email_Address__c" AS perm_email, c."TTU_Admissions_Email__c" AS adm_email,
    c."hed__UniversityEmail__c" AS uni_email,
    c."Phone" AS phone, c."MobilePhone" AS mobile_phone, c."HomePhone" AS home_phone,
    c."OtherPhone" AS other_phone, c."TargetX_SRMb__Alternate_Mobile_Phone__c" AS alt_mobile,
    c."TTU_Mobile_Phone_Digits_Only__c" AS digits,
    c."TargetX_SRMb__Status__c" AS status, r."Name" AS record_type, c."LeadSource" AS lead_source,
    c."TargetX_SRMb__Anticipated_Start_Term__c" AS term,
    c."MailingStreet" AS street, c."MailingCity" AS city, c."MailingState" AS state,
    c."MailingPostalCode" AS zip,
    c."TargetX_SRMb__BannerID__c" AS banner_id,
    c."TTU_Online_Student__c" AS online_student, c."TargetX_SRMb__IsDuplicate__c" AS is_duplicate,
    c."CreatedDate" AS sf_created, c."SystemModstamp" AS sf_modified`,
  from: `${sf("contact")} c LEFT JOIN ${sf("recordtype")} r ON r."Id" = c."RecordTypeId"`,
  where: CONTACT_SLICE("c"),
  hashCols: [
    `c."Name"`, `c."FirstName"`, `c."LastName"`, `c."TTU_Preferred_First_Name__c"`,
    `c."Alias_Nickname__c"`, `c."TargetX_SRMb__Former_Last_Name__c"`, `c."hed__Former_Last_Name__c"`,
    `c."Email"`, `c."TargetX_Email__AltEmail__c"`, `c."TTU_Email_Address__c"`,
    `c."TTU_Permanent_Email_Address__c"`, `c."TTU_Admissions_Email__c"`, `c."hed__UniversityEmail__c"`,
    `c."Phone"`, `c."MobilePhone"`, `c."HomePhone"`, `c."OtherPhone"`,
    `c."TargetX_SRMb__Alternate_Mobile_Phone__c"`, `c."TTU_Mobile_Phone_Digits_Only__c"`,
    `c."TargetX_SRMb__Status__c"`, `r."Name"`, `c."LeadSource"`,
    `c."TargetX_SRMb__Anticipated_Start_Term__c"`,
    `c."MailingStreet"`, `c."MailingCity"`, `c."MailingState"`, `c."MailingPostalCode"`,
    `c."TargetX_SRMb__BannerID__c"`, `c."TTU_Online_Student__c"`, `c."TargetX_SRMb__IsDuplicate__c"`,
    `c."CreatedDate"`, `c."SystemModstamp"`,
  ],
  map: (r) => [
    r.id, r.name, r.first_name, r.last_name, r.pref_first, r.nickname, r.former_last,
    r.email,
    dedupe([r.email, r.alt_email, r.ttu_email, r.perm_email, r.adm_email, r.uni_email]
      .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : "")).filter(Boolean)),
    r.phone, r.mobile_phone,
    dedupe([r.phone, r.mobile_phone, r.home_phone, r.other_phone, r.alt_mobile, r.digits]
      .map((p) => normalizePhone(typeof p === "string" ? p : "")).filter((d) => d.length >= 7)),
    r.status, r.record_type, r.lead_source, r.term,
    r.street, r.city, r.state, r.zip, r.banner_id,
    r.online_student ?? false, r.is_duplicate ?? false, r.sf_created, r.sf_modified, r.h,
  ],
};

const APPLICATION: TableSpec = {
  clone: "sf_application",
  cols: [
    "id", "app_number", "record_type", "stage", "status", "term", "decision",
    "review_status", "submitted", "contact_id", "program_id", "program_name",
    "student_type", "open_checklist", "checklist_total", "checklist_done",
    "pct_complete", "app_state", "completed_date", "items_received_date",
    "decision_display", "decision_published_at", "campus", "level", "is_test",
    "fee_received", "sf_created", "sf_modified", "row_hash",
  ],
  sel: `
    a."Id" AS id, a."Name" AS app_number, r."Name" AS record_type,
    a."TargetX_SRMb__Stage__c" AS stage, a."TargetX_SRMb__Status__c" AS status,
    a."TargetX_SRMb__Start_Term_and_Year__c" AS term,
    a."TargetX_SRMb__Decision__c" AS decision,
    a."TargetX_Reader__Review_Status__c" AS review_status,
    a."TargetX_SRMb__Application_Submit_Date__c" AS submitted,
    a."TargetX_SRMb__Contact__c" AS contact_id,
    a."TargetX_SRMb__Program__c" AS program_id, p."Name" AS program_name,
    a."TargetX_SRMb__Student_Type__c" AS student_type,
    a."TargetX_SRMb__openCheckListItem__c" AS open_checklist,
    a."ARM_Number_of_Checklist_Items__c" AS checklist_total,
    a."ARM_Number_of_Checklist_Items_Completed__c" AS checklist_done,
    a."TargetX_App__Percent_Complete__c" AS pct_complete,
    a."TargetX_App__Application_State__c" AS app_state,
    a."TTU_Application_Completed_Date__c" AS completed_date,
    a."TTU_Items_Received_Date__c" AS items_received_date,
    a."TargetX_SRMb__Decision_Display_Value__c" AS decision_display,
    a."TargetX_SRMb__Decision_Publish_Date_Time__c" AS decision_published_at,
    a."TargetX_SRMb__Campus__c" AS campus,
    a."TargetX_SRMb__Level__c" AS level,
    a."TargetX_App__Is_Test_Record__c" AS is_test,
    a."TargetX_SRMb__Application_Fee_Payment_Received__c" AS fee_received,
    a."CreatedDate" AS sf_created, a."SystemModstamp" AS sf_modified`,
  from: `${sf("application")} a
    LEFT JOIN ${sf("recordtype")} r ON r."Id" = a."RecordTypeId"
    LEFT JOIN ${sf("ttu_academic_program__c")} p ON p."Id" = a."TargetX_SRMb__Program__c"`,
  where: `(
    r."Name" = 'TTU Online'
    OR EXISTS (SELECT 1 FROM ${sf("contact")} c2
               WHERE c2."Id" = a."TargetX_SRMb__Contact__c" AND ${CONTACT_SLICE("c2")})
  )`,
  hashCols: [
    `a."Name"`, `r."Name"`, `a."TargetX_SRMb__Stage__c"`, `a."TargetX_SRMb__Status__c"`,
    `a."TargetX_SRMb__Start_Term_and_Year__c"`, `a."TargetX_SRMb__Decision__c"`,
    `a."TargetX_Reader__Review_Status__c"`, `a."TargetX_SRMb__Application_Submit_Date__c"`,
    `a."TargetX_SRMb__Contact__c"`, `a."TargetX_SRMb__Program__c"`, `p."Name"`,
    `a."TargetX_SRMb__Student_Type__c"`,
    `a."TargetX_SRMb__openCheckListItem__c"`, `a."ARM_Number_of_Checklist_Items__c"`,
    `a."ARM_Number_of_Checklist_Items_Completed__c"`, `a."TargetX_App__Percent_Complete__c"`,
    `a."TargetX_App__Application_State__c"`, `a."TTU_Application_Completed_Date__c"`,
    `a."TTU_Items_Received_Date__c"`, `a."TargetX_SRMb__Decision_Display_Value__c"`,
    `a."TargetX_SRMb__Decision_Publish_Date_Time__c"`, `a."TargetX_SRMb__Campus__c"`,
    `a."TargetX_SRMb__Level__c"`, `a."TargetX_App__Is_Test_Record__c"`,
    `a."TargetX_SRMb__Application_Fee_Payment_Received__c"`,
    `a."CreatedDate"`, `a."SystemModstamp"`,
  ],
  map: (r) => [
    r.id, r.app_number, r.record_type, r.stage, r.status, r.term, r.decision,
    r.review_status, r.submitted, r.contact_id, r.program_id, r.program_name,
    r.student_type, toInt(r.open_checklist), toInt(r.checklist_total), toInt(r.checklist_done),
    r.pct_complete, r.app_state, r.completed_date, r.items_received_date,
    r.decision_display, r.decision_published_at, r.campus, r.level, r.is_test,
    r.fee_received, r.sf_created, r.sf_modified, r.h,
  ],
};

// Per-item checklist clone. Source is the warehouse's AH.checklist_items —
// populated by the "SF Checklist Items -> AH" Lumen connector. If the pipe
// hasn't landed yet the spec reports { skipped } and nothing else changes.
const CHECKLIST: TableSpec = {
  clone: "sf_checklist_item",
  cols: [
    "id", "name", "application_id", "app_type", "status", "req_code",
    "item_received", "description", "long_description", "assigned", "is_closed",
    "waived", "not_required", "related_to", "visibility", "system_generated",
    "checkbox_field", "record_type_id", "is_deleted", "sf_created", "sf_modified", "row_hash",
  ],
  sel: `
    i."Id" AS id, i."Name" AS name, i."TargetX_SRMb__Application__c" AS application_id,
    i."TargetX_SRMb__Application_Type__c" AS app_type,
    i."TargetX_SRMb__Status__c" AS status, i."TargetX_SRMb__REQ_CODE__c" AS req_code,
    i."TTU_Item_Received__c" AS item_received,
    i."TargetX_SRMb__Description__c" AS description,
    i."TargetX_SRMb__Long_Description__c" AS long_description,
    i."TargetX_SRMb__Assigned__c" AS assigned, i."TargetX_SRMb__IsClosed__c" AS is_closed,
    i."Waived__c" AS waived, i."TTU_Not_Required__c" AS not_required,
    i."TargetX_SRMb__Related_To__c" AS related_to,
    i."TargetX_SRMb__visibility__c" AS visibility,
    i."TargetX_SRMb__System_Generated__c" AS system_generated,
    i."TargetX_SRMb__Checkbox_Field__c" AS checkbox_field,
    i."RecordTypeId" AS record_type_id, i."IsDeleted" AS is_deleted,
    i."CreatedDate" AS sf_created, i."SystemModstamp" AS sf_modified`,
  from: `"AH"."checklist_items" i`,
  // scope to TTU Online applications — the warehouse table holds ~1.5M items
  // across every app type; we only mirror the online slice (~150K)
  where: `NOT COALESCE(i."IsDeleted", false)
    AND EXISTS (SELECT 1 FROM ${sf("application")} xa
                JOIN ${sf("recordtype")} xr ON xr."Id" = xa."RecordTypeId"
                WHERE xa."Id" = i."TargetX_SRMb__Application__c"
                  AND xr."Name" = 'TTU Online')`,
  hashCols: [
    `i."Name"`, `i."TargetX_SRMb__Application__c"`, `i."TargetX_SRMb__Status__c"`,
    `i."TargetX_SRMb__REQ_CODE__c"`, `i."TTU_Item_Received__c"`,
    `i."TargetX_SRMb__Assigned__c"`, `i."TargetX_SRMb__IsClosed__c"`,
    `i."Waived__c"`, `i."TTU_Not_Required__c"`, `i."TargetX_SRMb__Related_To__c"`,
    `i."TargetX_SRMb__visibility__c"`, `i."CreatedDate"`, `i."SystemModstamp"`,
  ],
  map: (r) => [
    r.id, r.name, r.application_id, r.app_type, r.status, r.req_code,
    r.item_received, r.description, r.long_description, r.assigned, r.is_closed,
    r.waived, r.not_required, r.related_to, r.visibility, r.system_generated,
    r.checkbox_field, r.record_type_id, r.is_deleted, r.sf_created, r.sf_modified, r.h,
  ],
};

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

// SF numeric fields land as text like "3.0" in the warehouse — clone ints need it gone
const toInt = (v: unknown) => (v == null || v === "" ? null : Math.round(Number(v)));

// ---------------------------------------------------------------------------
// Two-phase table sync.
//  Phase A: paginate (id, md5(cols)) from the source, diff against clone hashes.
//  Phase B: full-row fetch for changed ids only -> upsert clone + append hist.
// ---------------------------------------------------------------------------
async function syncTable(spec: TableSpec, client: PoolClient, alias: string) {
  const cur = new Map<string, string>();
  for (const r of (await client.query(`SELECT id, row_hash FROM ${ah(spec.clone)}`)).rows)
    cur.set(r.id, r.row_hash);

  let seen = 0, changed = 0;
  const changedIds: string[] = [];
  const changedHash = new Map<string, string>();
  let lastId = "";
  for (;;) {
    const { rows } = await whPool().query<{ id: string; h: string }>(
      `SELECT ${alias}."Id" AS id, md5(concat_ws('|', ${spec.hashCols.join(",")})) AS h
       FROM ${spec.from} WHERE ${spec.where} AND ${alias}."Id" > $1
       ORDER BY ${alias}."Id" LIMIT $2`,
      [lastId, PAGE]
    );
    if (!rows.length) break;
    for (const r of rows) {
      seen++;
      if (cur.get(r.id) !== r.h) { changed++; changedIds.push(r.id); changedHash.set(r.id, r.h); }
    }
    lastId = rows[rows.length - 1].id;
    if (rows.length < PAGE) break;
  }

  // fetch + write changed rows in chunks (hash travels from phase A via r.h)
  const runTs = new Date();
  const allCols = [...spec.cols, "synced_at"];
  for (let i = 0; i < changedIds.length; i += 2_000) {
    const ids = changedIds.slice(i, i + 2_000);
    const { rows } = await whPool().query(
      `SELECT ${spec.sel} FROM ${spec.from} WHERE ${spec.where} AND ${alias}."Id" = ANY($1::text[])`,
      [ids]
    );
    for (const r of rows) r.h = changedHash.get(r.id);
    for (let j = 0; j < rows.length; j += CHUNK) {
      const batch = rows.slice(j, j + CHUNK).map(spec.map);
      const params: unknown[] = [];
      const tuples = batch.map((b) => {
        const start = params.length;
        for (const v of b) params.push(v);
        params.push(runTs);
        return `(${b.map((_, k) => `$${start + k + 1}`).join(",")},$${start + b.length + 1})`;
      }).join(",");
      const insertCols = allCols.join(",");
      await client.query(
        `INSERT INTO ${ah(spec.clone)} (${insertCols}) VALUES ${tuples}
         ON CONFLICT (id) DO UPDATE SET
           ${spec.cols.filter((c) => c !== "id").map((c) => `${c}=EXCLUDED.${c}`).join(", ")},
           synced_at=EXCLUDED.synced_at`,
        params
      );
      await client.query(
        `INSERT INTO ${ah(spec.clone + "_hist")} (${insertCols}) VALUES ${tuples}`,
        params
      );
    }
  }
  return { seen, changed };
}

// Small reference tables: plain upsert of every row, no history.
async function syncRef(
  client: PoolClient, clone: string, cols: string[], sql: string
) {
  const { rows } = await whPool().query(sql);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const tuples = batch.map((r) => {
      const start = params.length;
      for (const c of cols) params.push(r[c]);
      return `(${cols.map((_, k) => `$${start + k + 1}`).join(",")})`;
    }).join(",");
    await client.query(
      `INSERT INTO ${ah(clone)} (${cols.join(",")}) VALUES ${tuples}
       ON CONFLICT (id) DO UPDATE SET
         ${cols.filter((c) => c !== "id").map((c) => `${c}=EXCLUDED.${c}`).join(", ")},
         synced_at=now()`,
      params
    );
  }
  return { seen: rows.length, changed: rows.length };
}

// ---------------------------------------------------------------------------
// Post-table steps (run against the app DB inside the sync):
//  • detectApplications — a linked contact gained an SF application -> attach
//    it to the student's portal intent row and log a 'submitted' event.
//  • confirmPushedDocs — an admin marked an upload "pushed to SF"; once the SF
//    checklist item shows received/closed, parity is reached -> 'approved'.
// ---------------------------------------------------------------------------
async function detectApplications(client: PoolClient) {
  const { rows } = await client.query<{ id: string }>(
    `WITH latest AS (
       SELECT DISTINCT ON (l.user_id) l.user_id, sa.id AS sf_id
       FROM ${ah("portal_identity_links")} l
       JOIN ${ah("sf_application")} sa ON sa.contact_id = l.sf_contact_id
       WHERE l.status IN ('active','confirmed')
       ORDER BY l.user_id, sa.sf_created DESC NULLS LAST
     ), upd AS (
       UPDATE ${ah("portal_applications")} pa
       SET sf_application_id = t.sf_id, sf_detected_at = now(),
           status = 'submitted', updated_at = now()
       FROM latest t
       WHERE t.user_id = pa.user_id
         AND pa.sf_application_id IS NULL AND pa.status IN ('draft','rc_started')
       RETURNING pa.id, pa.user_id, t.sf_id)
     INSERT INTO ${ah("portal_application_events")} (application_id, user_id, to_status, actor_kind, note)
     SELECT id, user_id, 'submitted', 'system', 'Salesforce application detected' FROM upd
     RETURNING application_id AS id`
  );
  return rows.length;
}

async function confirmPushedDocs(client: PoolClient) {
  const res = await client.query(
    `UPDATE ${ah("portal_documents")} d
     SET status='approved', sf_confirmed_at=now()
     FROM ${ah("sf_checklist_item")} i
     WHERE i.id = d.sf_item_id AND d.status='pushed'
       AND (i.is_closed OR i.waived OR i.status ~* 'received|complete|approved|waived'
            OR NULLIF(i.item_received,'') IS NOT NULL)`
  );
  return res.rowCount ?? 0;
}

/** Live "check now" — reads the warehouse directly (fresher than the clone)
 *  for ONE contact. Used by the post-apply detect button/poller. Returns the
 *  newest SF application id if one appeared. */
export async function detectApplicationNow(contactId: string) {
  const { rows } = await whPool().query<{ id: string }>(
    `SELECT a."Id" AS id FROM ${sf("application")} a
     JOIN ${sf("recordtype")} r ON r."Id" = a."RecordTypeId"
     WHERE a."TargetX_SRMb__Contact__c" = $1 AND r."Name" = 'TTU Online'
     ORDER BY a."CreatedDate" DESC LIMIT 1`,
    [contactId]
  );
  if (!rows[0]) return null;
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Projection: generated portal columns stitched onto each linked SF contact.
// contactId scopes the rebuild to one record (used on link/status changes).
// ---------------------------------------------------------------------------
export async function rebuildProjections(client?: PoolClient | null, contactId?: string) {
  const run = (t: string, p?: unknown[]) =>
    client ? client.query(t, p) : q(t, p ?? []);
  const params = contactId ? [contactId] : [];
  const scope = contactId ? `AND l.sf_contact_id = $1` : "";

  const res = await run(
    `INSERT INTO ${ah("portal_contact_projection")} (
       sf_contact_id, portal_user_id, link_status, link_match_type, link_confidence,
       portal_app_id, portal_app_status, portal_app_program, portal_app_term,
       portal_app_submitted_at, portal_app_status_at, portal_app_history,
       checklist_done, checklist_total, last_portal_activity_at,
       sf_app_id, sf_app_status, sf_app_stage, sf_decision, sf_decision_display,
       sf_checklist_done, sf_checklist_total, sf_open_items, sf_pct,
       sf_app_submitted_at, sf_status_change_at, docs_pending, updated_at)
     SELECT DISTINCT ON (l.sf_contact_id)
       l.sf_contact_id, l.user_id, l.status, l.match_type, l.confidence,
       pa.id, pa.status, pa.program_name, pa.term, pa.submitted_at, pa.updated_at,
       coalesce(ev.hist, '[]'::jsonb), coalesce(ck.done, 0), coalesce(ck.total, 0),
       act.last_at,
       sa.id, sa.status, sa.stage, sa.decision, sa.decision_display,
       coalesce(sa.checklist_done, sfc.done), coalesce(sa.checklist_total, sfc.total),
       sa.open_checklist, sa.pct_complete, sa.submitted,
       GREATEST(sa.submitted, sa.items_received_date, sa.decision_published_at, sa.completed_date),
       coalesce(dp.n, 0), now()
     FROM ${ah("portal_identity_links")} l
     LEFT JOIN LATERAL (
       SELECT * FROM ${ah("portal_applications")} pa
       WHERE pa.user_id = l.user_id ORDER BY pa.created_at DESC LIMIT 1
     ) pa ON true
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
                'from', e.from_status, 'to', e.to_status,
                'at', e.created_at, 'by', e.actor_kind) ORDER BY e.created_at) AS hist
       FROM ${ah("portal_application_events")} e WHERE e.application_id = pa.id
     ) ev ON true
     LEFT JOIN LATERAL (
       SELECT count(*) FILTER (WHERE ci.status IN ('approved','waived'))::int AS done,
              count(*)::int AS total
       FROM ${ah("portal_checklist_items")} ci WHERE ci.user_id = l.user_id
     ) ck ON true
     LEFT JOIN LATERAL (
       SELECT max(a.created_at) AS last_at FROM ${ah("portal_activity")} a
       WHERE a.user_id = l.user_id
     ) act ON true
     LEFT JOIN LATERAL (
       SELECT * FROM ${ah("sf_application")} x
       WHERE x.contact_id = l.sf_contact_id
       ORDER BY x.sf_modified DESC NULLS LAST LIMIT 1
     ) sa ON true
     LEFT JOIN LATERAL (
       SELECT count(*) FILTER (WHERE i.is_closed OR i.waived OR i.not_required
                OR i.status ~* 'received|complete|approved|waived|satisfied'
                OR NULLIF(i.item_received,'') IS NOT NULL)::int AS done,
              count(*)::int AS total
       FROM ${ah("sf_checklist_item")} i
       WHERE i.application_id = sa.id
     ) sfc ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS n FROM ${ah("portal_documents")} d
       WHERE d.user_id = l.user_id AND d.status IN ('pending_review','pushed')
     ) dp ON true
     WHERE l.status IN ('active','confirmed') AND l.sf_contact_id IS NOT NULL ${scope}
     ORDER BY l.sf_contact_id, l.created_at DESC
     ON CONFLICT (sf_contact_id) DO UPDATE SET
       portal_user_id=EXCLUDED.portal_user_id, link_status=EXCLUDED.link_status,
       link_match_type=EXCLUDED.link_match_type, link_confidence=EXCLUDED.link_confidence,
       portal_app_id=EXCLUDED.portal_app_id, portal_app_status=EXCLUDED.portal_app_status,
       portal_app_program=EXCLUDED.portal_app_program, portal_app_term=EXCLUDED.portal_app_term,
       portal_app_submitted_at=EXCLUDED.portal_app_submitted_at,
       portal_app_status_at=EXCLUDED.portal_app_status_at,
       portal_app_history=EXCLUDED.portal_app_history,
       checklist_done=EXCLUDED.checklist_done, checklist_total=EXCLUDED.checklist_total,
       last_portal_activity_at=EXCLUDED.last_portal_activity_at,
       sf_app_id=EXCLUDED.sf_app_id, sf_app_status=EXCLUDED.sf_app_status,
       sf_app_stage=EXCLUDED.sf_app_stage, sf_decision=EXCLUDED.sf_decision,
       sf_decision_display=EXCLUDED.sf_decision_display,
       sf_checklist_done=EXCLUDED.sf_checklist_done,
       sf_checklist_total=EXCLUDED.sf_checklist_total,
       sf_open_items=EXCLUDED.sf_open_items, sf_pct=EXCLUDED.sf_pct,
       sf_app_submitted_at=EXCLUDED.sf_app_submitted_at,
       sf_status_change_at=EXCLUDED.sf_status_change_at,
       docs_pending=EXCLUDED.docs_pending, updated_at=now()`,
    params
  );

  // prune projections whose link was rejected/removed
  await run(
    `DELETE FROM ${ah("portal_contact_projection")}
     WHERE sf_contact_id NOT IN (
       SELECT sf_contact_id FROM ${ah("portal_identity_links")}
       WHERE status IN ('active','confirmed') AND sf_contact_id IS NOT NULL)
     ${contactId ? "AND sf_contact_id = $1" : ""}`,
    params
  );
  return res.rowCount ?? 0;
}

/** Keep one contact's projection fresh after a link/status/application change. */
export async function refreshProjectionForUser(userId: string) {
  const { rows } = await q<{ sf_contact_id: string }>(
    `SELECT sf_contact_id FROM ${ah("portal_identity_links")}
     WHERE user_id=$1 AND status IN ('active','confirmed') AND sf_contact_id IS NOT NULL`,
    [userId]
  );
  if (rows[0]?.sf_contact_id) await rebuildProjections(null, rows[0].sf_contact_id);
}

export async function refreshProjectionForContact(contactId: string) {
  await rebuildProjections(null, contactId);
}

// ---------------------------------------------------------------------------
// The run itself.
// ---------------------------------------------------------------------------
export interface SyncResult {
  skipped?: string;
  runId?: number;
  stats?: Record<string, unknown>;
  error?: string;
}

export async function runSync(trigger: SyncTrigger, actorId?: string): Promise<SyncResult> {
  const client = await appPool().connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!rows[0].ok) return { skipped: "a sync run is already in progress" };

    const run = await client.query<{ id: number }>(
      `INSERT INTO ${ah("sf_sync_runs")} (trigger, actor_id) VALUES ($1,$2) RETURNING id`,
      [trigger, actorId ?? null]
    );
    const runId = run.rows[0].id;
    const stats: Record<string, unknown> = {};

    try {
      stats.recordtype = await syncRef(client, "sf_recordtype", ["id", "name"],
        `SELECT "Id" AS id, "Name" AS name FROM ${sf("recordtype")}`);
      stats.term = await syncRef(client, "sf_term", ["id", "name", "start_date"],
        `SELECT "Id" AS id, "Name" AS name, "TTU_Start_Date__c" AS start_date FROM ${sf("ttu_term__c")}`);
      stats.program = await syncRef(client, "sf_program",
        ["id", "name", "degree", "college", "is_online"],
        `SELECT "Id" AS id, "Name" AS name, "TTU_Degree__c" AS degree,
                "TTU_Academic_College__c" AS college, "TTU_isOnline_Program__c" AS is_online
         FROM ${sf("ttu_academic_program__c")}`);
      stats.contact = await syncTable(CONTACT, client, "c");
      stats.application = await syncTable(APPLICATION, client, "a");

      // Checklist items live in the warehouse's AH schema (Lumen connector
      // "SF Checklist Items -> AH"). Not fatal while the pipe isn't up yet.
      const ckSrc = await whPool().query<{ t: string | null }>(
        `SELECT to_regclass('"AH"."checklist_items"')::text AS t`
      );
      if (ckSrc.rows[0]?.t)
        stats.checklist_item = await syncTable(CHECKLIST, client, "i");
      else
        stats.checklist_item = { skipped: "warehouse AH.checklist_items missing — run the SF Checklist Items pipe" };

      stats.detected_apps = await detectApplications(client);
      stats.docs_confirmed = await confirmPushedDocs(client);
      stats.projection_rows = await rebuildProjections(client);
      await client.query(
        `UPDATE ${ah("sf_sync_runs")} SET status='ok', stats=$2, finished_at=now() WHERE id=$1`,
        [runId, JSON.stringify(stats)]
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await client.query(
        `UPDATE ${ah("sf_sync_runs")} SET status='error', error=$2, finished_at=now() WHERE id=$1`,
        [runId, msg]
      ).catch(() => {});
      return { runId, error: msg, stats };
    }
    return { runId, stats };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Scheduler — started once from instrumentation.ts on the Node runtime.
// ---------------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var __ahSyncStarted: boolean | undefined;
}

export function startSyncLoop() {
  if (global.__ahSyncStarted) return;
  global.__ahSyncStarted = true;

  const mins = syncIntervalMinutes();

  // boot catch-up: clone empty or last successful run older than the interval
  (async () => {
    const empty = await q<{ n: number }>(`SELECT count(*)::int AS n FROM ${ah("sf_contact")}`)
      .then((r) => !r.rows[0]?.n);
    const fresh = await q<{ ok: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ${ah("sf_sync_runs")}
                     WHERE status='ok' AND finished_at > now() - make_interval(mins => $1)) AS ok`,
      [mins]
    ).then((r) => !!r.rows[0]?.ok);
    if (empty || !fresh) {
      console.log("[sync] boot catch-up run starting");
      const res = await runSync("boot");
      if (res.error) console.error("[sync] boot run failed:", res.error);
      else console.log("[sync] boot run complete:", JSON.stringify(res.stats));
    }
  })().catch((e) =>
    console.warn("[sync] skipped — clone tables missing? run scripts/migrate.sql (", e.message, ")")
  );

  if (!mins) {
    console.warn("[sync] scheduled runs disabled (SYNC_INTERVAL_MINUTES=0)");
    return;
  }
  const timer = setInterval(() => {
    runSync("schedule").then((r) => {
      if (r.error) console.error("[sync] scheduled run failed:", r.error);
    }).catch((e) => console.error("[sync] scheduled run crashed:", e?.message ?? e));
  }, mins * 60_000);
  timer.unref();
  console.log(`[sync] engine armed — every ${mins}m + manual via /admin/sync`);
}
