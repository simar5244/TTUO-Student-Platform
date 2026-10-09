import { redirect } from "next/navigation";

// Audit trail merged into Analytics ("/admin/analytics" → Audit trail tab).
export default function AuditRedirect() {
  redirect("/admin/analytics");
}
