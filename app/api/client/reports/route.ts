import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildClientMonthlyReport } from "@/lib/portal/reports";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;

  const companyId = auth.session.user.companyId;
  const period = await db.accountingPeriod.findFirst({
    where: { companyId },
    orderBy: { startDate: "desc" }
  });
  if (!period) {
    return NextResponse.json({ ok: false, error: "No period" }, { status: 404 });
  }

  const existing = await db.reportSnapshot.findUnique({
    where: { companyId_periodId: { companyId, periodId: period.id } }
  });

  if (existing && auth.session.user.isClient) {
    return NextResponse.json({ ok: true, report: existing });
  }

  // Accountants can regenerate; clients see published/ready only
  if (auth.session.user.isAccountant || !existing) {
    const built = await buildClientMonthlyReport(companyId, period.id);
    return NextResponse.json({ ok: true, report: built.snapshot, summary: built.summary });
  }

  return NextResponse.json({ ok: true, report: existing });
}
