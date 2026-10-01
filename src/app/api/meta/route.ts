import { listTerms, listPrograms, listDistinct } from "@/lib/sf";
import { json } from "@/lib/api";
import { q, sf } from "@/lib/db";

async function appRecordTypes() {
  const { rows } = await q<{ v: string }>(`SELECT DISTINCT r."Name" AS v FROM ${sf("application")} a JOIN ${sf("recordtype")} r ON r."Id"=a."RecordTypeId" WHERE r."Name" IS NOT NULL ORDER BY 1`);
  return rows.map((r) => r.v);
}

export async function GET() {
  const [terms, programs, studentTypes, stages, appStatuses, sources, contactStatuses, contactTerms, recordTypes] = await Promise.all([
    listTerms(), listPrograms(true),
    listDistinct("TargetX_SRMb__Student_Type__c", "application"),
    listDistinct("TargetX_SRMb__Stage__c", "application"),
    listDistinct("TargetX_SRMb__Status__c", "application"),
    listDistinct("LeadSource", "contact"),
    listDistinct("TargetX_SRMb__Status__c", "contact"),
    listDistinct("TargetX_SRMb__Anticipated_Start_Term__c", "contact"),
    appRecordTypes(),
  ]);
  const vals = (r: { rows: { v: string }[] }) => r.rows.map((x) => x.v).filter(Boolean);
  return json({
    terms: terms.rows, programs: programs.rows,
    studentTypes: vals(studentTypes),
    appStages: vals(stages),
    appStatuses: vals(appStatuses),
    leadSources: vals(sources),
    contactStatuses: vals(contactStatuses),
    contactTerms: vals(contactTerms),
    recordTypes,
  });
}
