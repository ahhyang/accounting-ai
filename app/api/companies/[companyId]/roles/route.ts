import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId, { permission: "VIEW" });
  if (!auth.ok) return auth.error;

  const roles = await db.role.findMany({
    where: { companyId: params.companyId },
    include: {
      permissions: true,
      _count: { select: { members: true } }
    },
    orderBy: { name: "asc" }
  });

  return NextResponse.json({ ok: true, roles });
}
