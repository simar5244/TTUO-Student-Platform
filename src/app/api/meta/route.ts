import { listTerms, listPrograms, listDistinct } from "@/lib/sf";
import { json } from "@/lib/api";
import { q, ah } from "@/lib/db";

async function appRecordTypes() {
  const { rows } = await q<{ v: string }>(`SELECT DISTINCT record_type AS v FROM ${ah("sf_application")} WHERE record_type IS NOT NULL ORDER BY 1`);
  return rows.map((r) => r.v);
}

export async function GET() {
  const [terms, programs, studentTypes, stages, appStatuses, sources, contactStatuses, contactTerms, recordTypes] = await Promise.all([
    listTerms(), listPrograms(true),
    listDistinct("student_type", "sf_application"),
    listDistinct("stage", "sf_application"),
    listDistinct("status", "sf_application"),
    listDistinct("lead_source", "sf_contact"),
    listDistinct("status", "sf_contact"),
    listDistinct("term", "sf_contact"),
    appRecordTypes(),
  ]);
  const vals = (r: { rows: { v: string }[] }) => r.rows.map((x) => x.v).filter(Boolean);
  // the RaiderConnect program picker — portal_programs is seeded from the RC
  // apply flow (8-week = full online list, 16-week = Education only)
  const { rows: rcPrograms } = await q<{ label: string; modality: string; level: string; degree: string | null; sort: number }>(
    `SELECT label, modality, level, degree, sort FROM ${ah("portal_programs")} WHERE active ORDER BY sort, label`);

  return json({
    terms: terms.rows, programs: programs.rows,
    rcPrograms,
    studentTypes: vals(studentTypes),
    appStages: vals(stages),
    appStatuses: vals(appStatuses),
    leadSources: vals(sources),
    contactStatuses: vals(contactStatuses),
    contactTerms: vals(contactTerms),
    recordTypes,
    applyEnabled: process.env.APPLY_ENABLED === "true",
  });
}
