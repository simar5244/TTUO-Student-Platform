import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { PortalNav } from "@/components/PortalNav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/portal");
  if (user.role !== "student") redirect("/admin");

  return (
    <div className="min-h-dvh bg-paper">
      <PortalNav name={user.display_name || user.email} />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:pb-16 lg:max-w-4xl">
        {children}
      </main>
    </div>
  );
}
