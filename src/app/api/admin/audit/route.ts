import { NextRequest } from "next/server";
import { requireApiUser, isResp, json } from "@/lib/api";
import { q, ah } from "@/lib/db";

// Admin-only audit explorer: every tracked event by every user
export async function GET(req: NextRequest) {
  const user = await requireApiUser(["admin"]);
  if (isResp(user)) return user;
  const p = req.nextUrl.searchParams;
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (p.get("user")) where.push(`a.user_id = ${add(p.get("user"))}`);
  if (p.get("kind")) where.push(`a.kind = ${add(p.get("kind"))}`);
  if (p.get("path")) where.push(`a.path ILIKE ${add(`%${p.get("path")}%`)}`);
  if (p.get("search")) {
    const ph = add(`%${p.get("search")}%`);
    where.push(`(u.email ILIKE ${ph} OR u.display_name ILIKE ${ph} OR a.path ILIKE ${ph} OR a.detail::text ILIKE ${ph})`);
  }
  const page = Math.max(Number(p.get("page") || 1), 1);
  const per = 50;
  const base = `FROM ${ah("portal_activity")} a LEFT JOIN ${ah("portal_users")} u ON u.id=a.user_id WHERE ${where.join(" AND ")}`;
  const [count, rows] = await Promise.all([
    q<{ n: number }>(`SELECT count(*)::int AS n ${base}`, params),
    q(`SELECT a.*, u.email, u.display_name, u.role ${base} ORDER BY a.id DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, params),
  ]);
  return json({ total: count.rows[0].n, rows: rows.rows, page, perPage: per });
}
