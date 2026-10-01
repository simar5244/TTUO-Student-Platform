// Read-only queries against the Salesforce mirror (sf_origin schema).
import { q, sf } from "./db";
import { normalizePhone } from "./auth";

export interface SfContact {
  Id: string;
  Name: string | null;
  FirstName: string | null;
  LastName: string | null;
  Email: string | null;
  Phone: string | null;
  MobilePhone: string | null;
  digits: string | null;
  status: string | null;
  record_type: string | null;
  lead_source: string | null;
  term: string | null;
  city: string | null;
  state: string | null;
  created: Date | null;
  banner_id: string | null;
}

const CONTACT_SELECT = `
  c."Id", c."Name", c."FirstName", c."LastName", c."Email", c."Phone", c."MobilePhone",
  c."TTU_Mobile_Phone_Digits_Only__c" AS digits,
  c."TargetX_SRMb__Status__c" AS status,
  r."Name" AS record_type,
  c."LeadSource" AS lead_source,
  c."TargetX_SRMb__Anticipated_Start_Term__c" AS term,
  c."MailingCity" AS city, c."MailingState" AS state,
  c."CreatedDate" AS created,
  c."TargetX_SRMb__BannerID__c" AS banner_id
  FROM ${sf("contact")} c
  LEFT JOIN ${sf("recordtype")} r ON r."Id" = c."RecordTypeId"`;

export async function findContactById(id: string): Promise<SfContact | null> {
  const { rows } = await q<SfContact>(`SELECT ${CONTACT_SELECT} WHERE c."Id" = $1`, [id]);
  return rows[0] ?? null;
}

export async function matchContact(email: string, phone: string | null) {
  const digits = normalizePhone(phone);
  const { rows } = await q<SfContact>(
    `SELECT ${CONTACT_SELECT}
      WHERE lower(c."Email") = lower($1)
         OR (NULLIF($2,'') IS NOT NULL AND (
              c."TTU_Mobile_Phone_Digits_Only__c" = $2
              OR regexp_replace(coalesce(c."MobilePhone",''),'\\D','','g') = $2
              OR regexp_replace(coalesce(c."Phone",''),'\\D','','g') = $2))
      ORDER BY (lower(c."Email") = lower($1)) DESC, c."CreatedDate" DESC
      LIMIT 10`,
    [email, digits]
  );
  return rows.map((c) => {
    const fields = {
      email: !!c.Email && c.Email.toLowerCase() === email.toLowerCase(),
      phone: !!digits && (c.digits === digits ||
        normalizePhone(c.MobilePhone) === digits || normalizePhone(c.Phone) === digits),
    };
    const score = (fields.email ? 1 : 0) + (fields.phone ? 1 : 0);
    return { contact: c, fields, score };
  });
}

export async function listLeads(opts: {
  search?: string; status?: string; term?: string; source?: string;
  recordType?: string; page?: number; perPage?: number;
}) {
  const where: string[] = ["r.\"Name\" IN ('Prospective Student','International','Degree Completion')"];
  const params: unknown[] = [];
  const add = (v: string) => { params.push(v); return `$${params.length}`; };
  if (opts.search) {
    const p = add(`%${opts.search}%`);
    where.push(`(c."Name" ILIKE ${p} OR c."Email" ILIKE ${p} OR c."MobilePhone" ILIKE ${p})`);
  }
  if (opts.status) where.push(`c."TargetX_SRMb__Status__c" = ${add(opts.status)}`);
  if (opts.term) where.push(`c."TargetX_SRMb__Anticipated_Start_Term__c" = ${add(opts.term)}`);
  if (opts.source) where.push(`c."LeadSource" = ${add(opts.source)}`);
  if (opts.recordType) where.push(`r."Name" = ${add(opts.recordType)}`);
  const perPage = Math.min(opts.perPage ?? 25, 100);
  const page = Math.max(opts.page ?? 1, 1);
  const countQ = q<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${sf("contact")} c
     LEFT JOIN ${sf("recordtype")} r ON r."Id"=c."RecordTypeId" WHERE ${where.join(" AND ")}`, params);
  const listQ = q<SfContact>(
    `SELECT ${CONTACT_SELECT} WHERE ${where.join(" AND ")}
     ORDER BY c."CreatedDate" DESC NULLS LAST LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`, params);
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
    where.push(`(c."Name" ILIKE ${p} OR c."Email" ILIKE ${p} OR a."Name" ILIKE ${p})`);
  }
  if (opts.stage) where.push(`a."TargetX_SRMb__Stage__c" = ${add(opts.stage)}`);
  if (opts.status) where.push(`a."TargetX_SRMb__Status__c" = ${add(opts.status)}`);
  if (opts.term) where.push(`a."TargetX_SRMb__Start_Term_and_Year__c" = ${add(opts.term)}`);
  if (opts.recordType) where.push(`r."Name" = ${add(opts.recordType)}`);
  const from = `FROM ${sf("application")} a
     JOIN ${sf("contact")} c ON c."Id" = a."TargetX_SRMb__Contact__c"
     LEFT JOIN ${sf("recordtype")} r ON r."Id" = a."RecordTypeId"`;
  const perPage = Math.min(opts.perPage ?? 25, 100);
  const page = Math.max(opts.page ?? 1, 1);
  const countQ = q<{ n: number }>(`SELECT count(*)::int AS n ${from} WHERE ${where.join(" AND ")}`, params);
  const listQ = q(
    `SELECT a."Id", a."Name" AS app_number, r."Name" AS record_type,
            a."TargetX_SRMb__Stage__c" AS stage, a."TargetX_SRMb__Status__c" AS status,
            a."TargetX_SRMb__Start_Term_and_Year__c" AS term,
            a."TargetX_SRMb__Application_Submit_Date__c" AS submitted,
            a."CreatedDate" AS created,
            a."TargetX_SRMb__Program__c" AS program_id,
            p."Name" AS program_name,
            c."Id" AS contact_id, c."Name" AS student, c."Email" AS email,
            c."MobilePhone" AS phone, c."TargetX_SRMb__Status__c" AS contact_status
     ${from} WHERE ${where.join(" AND ")}
     ORDER BY a."CreatedDate" DESC NULLS LAST LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
    params);
  const [c2, l] = await Promise.all([countQ, listQ]);
  return { total: c2.rows[0]?.n ?? 0, rows: l.rows, page, perPage };
}

export async function getApplication(id: string) {
  const { rows } = await q(
    `SELECT a.*, r."Name" AS record_type, p."Name" AS program_name,
            c."Name" AS student, c."Email" AS email, c."Id" AS contact_id
     FROM ${sf("application")} a
     LEFT JOIN ${sf("recordtype")} r ON r."Id" = a."RecordTypeId"
     LEFT JOIN ${sf("ttu_academic_program__c")} p ON p."Id" = a."TargetX_SRMb__Program__c"
     LEFT JOIN ${sf("contact")} c ON c."Id" = a."TargetX_SRMb__Contact__c"
     WHERE a."Id" = $1`, [id]);
  return rows[0] ?? null;
}

export async function contactApplications(contactId: string) {
  const { rows } = await q(
    `SELECT a."Id", a."Name" AS app_number, r."Name" AS record_type,
            a."TargetX_SRMb__Stage__c" AS stage, a."TargetX_SRMb__Status__c" AS status,
            a."TargetX_SRMb__Start_Term_and_Year__c" AS term,
            a."TargetX_SRMb__Application_Submit_Date__c" AS submitted,
            p."Name" AS program_name, a."CreatedDate" AS created
     FROM ${sf("application")} a
     LEFT JOIN ${sf("recordtype")} r ON r."Id" = a."RecordTypeId"
     LEFT JOIN ${sf("ttu_academic_program__c")} p ON p."Id" = a."TargetX_SRMb__Program__c"
     WHERE a."TargetX_SRMb__Contact__c" = $1 ORDER BY a."CreatedDate" DESC`, [contactId]);
  return rows;
}

export const listTerms = () =>
  q(`SELECT "Id" AS id, "Name" AS name FROM ${sf("ttu_term__c")} ORDER BY "TTU_Start_Date__c" DESC NULLS LAST`);

export const listPrograms = (onlineOnly = true) =>
  q(`SELECT "Id" AS id, "Name" AS name, "TTU_Degree__c" AS degree, "TTU_Academic_College__c" AS college
     FROM ${sf("ttu_academic_program__c")} ${onlineOnly ? 'WHERE "TTU_isOnline_Program__c"' : ""} ORDER BY "Name"`);

export const listDistinct = (col: string, table = "contact") =>
  q<{ v: string }>(`SELECT DISTINCT "${col}" AS v FROM ${sf(table)} WHERE "${col}" IS NOT NULL AND "${col}" <> '' ORDER BY 1 LIMIT 200`);

export async function funnelStats() {
  const { rows } = await q(
    `SELECT c."TargetX_SRMb__Status__c" AS status, count(*)::int AS n
     FROM ${sf("contact")} c GROUP BY 1 ORDER BY 2 DESC`);
  return rows;
}
