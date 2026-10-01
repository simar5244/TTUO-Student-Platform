"use client";

import { PageHeader } from "@/components/ui";
import { DataTable } from "@/components/DataTable";

export default function LeadsPage() {
  return (
    <div>
      <PageHeader title="Leads" sub="Prospective students from Salesforce — RFI submissions, events, calls" />
      <DataTable
        endpoint="/api/admin/leads"
        rowHref={(r) => `/admin/people/${r.Id}`}
        filters={[
          { def: { key: "status", label: "Status", options: [] }, metaKey: "contactStatuses" },
          { def: { key: "source", label: "Lead source", options: [] }, metaKey: "leadSources" },
          { def: { key: "term", label: "Term", options: [] }, metaKey: "contactTerms" },
          { def: { key: "recordType", label: "Record type", options: ["Prospective Student", "International", "Degree Completion"] } },
        ]}
        columns={[
          { key: "Name", label: "Name", render: (r) => <span className="font-medium">{String(r.Name ?? "—")}</span> },
          { key: "Email", label: "Email", hideMobile: true },
          { key: "MobilePhone", label: "Phone", hideMobile: true },
          { key: "status", label: "Status", pill: true },
          { key: "lead_source", label: "Source", hideMobile: true, render: (r) => <span className="text-xs text-mute">{String(r.lead_source ?? "—")}</span> },
          { key: "term", label: "Term", hideMobile: true },
          { key: "created", label: "Created", hideMobile: true, render: (r) => r.created ? new Date(String(r.created)).toLocaleDateString() : "—" },
        ]}
      />
    </div>
  );
}
