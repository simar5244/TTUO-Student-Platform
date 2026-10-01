"use client";

import { PageHeader } from "@/components/ui";
import { DataTable } from "@/components/DataTable";

export default function ApplicationsPage() {
  return (
    <div>
      <PageHeader title="Applications" sub="Every application in Salesforce — click a row for the student 360" />
      <DataTable
        endpoint="/api/admin/applications"
        rowHref={(r) => `/admin/people/${r.contact_id}?app=${r.Id}`}
        filters={[
          { def: { key: "term", label: "Term", options: [] }, metaKey: "terms" },
          { def: { key: "recordType", label: "App type", options: [] }, metaKey: "recordTypes" },
          { def: { key: "stage", label: "Stage", options: [] }, metaKey: "appStages" },
          { def: { key: "status", label: "Status", options: [] }, metaKey: "appStatuses" },
        ]}
        columns={[
          { key: "student", label: "Student", render: (r) => <span className="font-medium">{String(r.student ?? "—")}</span> },
          { key: "app_number", label: "App #" },
          { key: "record_type", label: "Type", render: (r) => <span className="text-xs">{String(r.record_type ?? "")}</span> },
          { key: "program_name", label: "Program", hideMobile: true },
          { key: "term", label: "Term" },
          { key: "stage", label: "Stage", pill: true },
          { key: "status", label: "Status", pill: true },
          { key: "submitted", label: "Submitted", hideMobile: true, render: (r) => r.submitted ? new Date(String(r.submitted)).toLocaleDateString() : "—" },
        ]}
      />
    </div>
  );
}
