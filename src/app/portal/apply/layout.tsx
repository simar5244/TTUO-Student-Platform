import { redirect } from "next/navigation";

// Apply is disabled until the owner whitelists it — set APPLY_ENABLED=true to
// re-open the handoff flow. Hidden from nav too (see PortalNav).
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  if (process.env.APPLY_ENABLED !== "true") redirect("/portal");
  return <>{children}</>;
}
