import { NextRequest } from "next/server";
import { requireApiUser, isResp, json } from "@/lib/api";
import { listApplications } from "@/lib/sf";

export async function GET(req: NextRequest) {
  const user = await requireApiUser(["advisor", "manager", "admin"]);
  if (isResp(user)) return user;
  const p = req.nextUrl.searchParams;
  const data = await listApplications({
    search: p.get("search") || undefined,
    stage: p.get("stage") || undefined,
    status: p.get("status") || undefined,
    term: p.get("term") || undefined,
    recordType: p.get("recordType") || undefined,
    page: Number(p.get("page") || 1),
  });
  return json(data);
}
