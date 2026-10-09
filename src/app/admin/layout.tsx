import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminNav } from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!["advisor", "manager", "admin"].includes(user.role)) redirect("/portal");

  return (
    <div className="min-h-dvh bg-smoke/40 lg:grid lg:grid-cols-[230px_1fr]">
      <AdminNav role={user.role} />
      <main className="min-w-0 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">{children}</main>
    </div>
  );
}
