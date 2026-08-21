import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isClientRole } from "@/lib/permissions/constants";

export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;

  if (isClientRole(auth.session.user.roleName)) {
    return NextResponse.json({ ok: false, error: "Accountant access required." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || undefined;
  const status = searchParams.get("status") || undefined;
  const category = searchParams.get("category") || undefined;

  // Accountant sees all companies they belong to
  const memberships = await db.companyUser.findMany({
    where: { userId: auth.session.user.id },
    select: { companyId: true }
  });
  const companyIds = memberships.map((m) => m.companyId);

  const docs = await db.sourceDocument.findMany({
    where: {
      companyId: companyId ? companyId : { in: companyIds },
      ...(status ? { status: status as never } : {}),
      ...(category ? { category: category as never } : {})
    },
    include: {
      company: true,
      period: true,
      uploadedBy: true,
      suggestions: { orderBy: { createdAt: "desc" }, take: 1 }
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  const ready = docs.filter((d) => d.status === "IN_REVIEW" && Number(d.aiConfidence ?? 0) >= 70);
  const needsManual = docs.filter(
    (d) => d.status === "IN_REVIEW" && Number(d.aiConfidence ?? 0) < 70
  );
  const waitingClient = docs.filter((d) => d.status === "NEEDS_CLIENT");

  return NextResponse.json({
    ok: true,
    groups: {
      readyToApprove: ready,
      needsManual,
      waitingOnClient: waitingClient
    },
    documents: docs
  });
}
