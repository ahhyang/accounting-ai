import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ensureMonthChecklist } from "@/lib/portal/documents";
import { clientStatusLabel } from "@/lib/portal/checklist";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;

  const companyId = auth.session.user.companyId;
  const period = await db.accountingPeriod.findFirst({
    where: { companyId },
    orderBy: { startDate: "desc" }
  });

  if (!period) {
    return NextResponse.json({ ok: false, error: "No accounting period." }, { status: 404 });
  }

  const checklist = await ensureMonthChecklist(companyId, period.id);
  const done = checklist.filter((c) => c.status === "UPLOADED" || c.status === "ACCEPTED" || c.status === "SKIPPED").length;
  const progress = Math.round((done / checklist.length) * 100);

  return NextResponse.json({
    ok: true,
    company: {
      id: companyId,
      name: auth.session.user.companyName
    },
    period,
    progress,
    checklist: checklist.map((item) => ({
      ...item,
      statusLabel: clientStatusLabel(item.status),
      documentStatusLabel: item.sourceDocument
        ? clientStatusLabel(item.sourceDocument.status)
        : null
    }))
  });
}
