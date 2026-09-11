import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/log";
import { tidyCompanyDocuments } from "@/lib/portal/tidy-documents";

export const maxDuration = 60;

/**
 * Client marks “all bills/receipts submitted”.
 * Notifies accountant and runs AI tidy (classify → rename → count).
 * Does not auto-post journals — accountant reviews / posts next.
 */
export async function POST() {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;

  const companyId = auth.session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "No company on session." }, { status: 400 });
  }

  const period = await db.accountingPeriod.findFirst({
    where: { companyId },
    orderBy: { startDate: "desc" }
  });

  if (!period) {
    return NextResponse.json({ ok: false, error: "No accounting period." }, { status: 404 });
  }

  const docCount = await db.sourceDocument.count({
    where: {
      companyId,
      periodId: period.id,
      status: { not: "REJECTED" as never }
    }
  });

  if (docCount === 0) {
    return NextResponse.json(
      { ok: false, error: "Upload at least one bill or receipt before submitting." },
      { status: 400 }
    );
  }

  const periodLabel = `${period.startDate.toISOString().slice(0, 10)} → ${period.endDate
    .toISOString()
    .slice(0, 10)}`;

  await db.clientMessage.create({
    data: {
      companyId,
      senderUserId: auth.session.user.id,
      body: `Client marked all documents submitted for period ${periodLabel}. Please review AI tidy & bookkeeping.`
    }
  });

  await writeAuditEvent({
    companyId,
    actorUserId: auth.session.user.id,
    entityType: "AccountingPeriod",
    entityId: period.id,
    action: "CLIENT_SUBMIT_COMPLETE",
    afterJson: { documentCount: docCount, periodLabel }
  });

  let tidy: Awaited<ReturnType<typeof tidyCompanyDocuments>> | null = null;
  let tidyError: string | null = null;

  try {
    tidy = await tidyCompanyDocuments({
      companyId,
      periodId: period.id,
      actorUserId: auth.session.user.id,
      reRunAi: true,
      autoPostReady: false
    });
  } catch (error) {
    tidyError = error instanceof Error ? error.message : "AI tidy failed";
  }

  return NextResponse.json({
    ok: true,
    message:
      "Submitted. AI is organizing documents (category, rename, count). Your accountant will finish the books.",
    period: { id: period.id, label: periodLabel },
    documentCount: docCount,
    tidy: tidy
      ? {
          summary: tidy.summary,
          documents: tidy.documents
        }
      : null,
    tidyError
  });
}
