import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string } }
) {
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
