import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isClientRole } from "@/lib/permissions/constants";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;
  if (isClientRole(auth.session.user.roleName)) {
    return NextResponse.json({ ok: false, error: "Accountant only" }, { status: 403 });
  }

  const companyId = new URL(request.url).searchParams.get("companyId") || auth.session.user.companyId;
  const access = await db.companyUser.findUnique({
    where: {
      companyId_userId: { companyId, userId: auth.session.user.id }
    }
  });
  if (!access) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const events = await db.auditEvent.findMany({
    where: { companyId },
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  const bills = await db.purchaseBill.findMany({ where: { companyId } });
  const map = new Map<string, number>();
  for (const b of bills) {
    const key = `${b.supplierId}|${Number(b.total)}|${b.billDate.toISOString().slice(0, 10)}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const duplicateBillGroups = Array.from(map.values()).filter((n) => n > 1).length;

  return NextResponse.json({
    ok: true,
    events,
    exceptions: {
      duplicateBillGroups,
      needsClientDocs: await db.sourceDocument.count({
        where: { companyId, status: "NEEDS_CLIENT" }
      }),
      lowConfidenceDocs: await db.sourceDocument.count({
        where: { companyId, status: "IN_REVIEW", aiConfidence: { lt: 70 } }
      })
    }
  });
}
