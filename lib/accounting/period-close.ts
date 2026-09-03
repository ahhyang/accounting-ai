import { db } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/log";
import { calculateCompletionScore } from "@/lib/accounting/month-end";
import { getTrialBalance } from "@/lib/accounting/trial-balance";
import { PostingError } from "@/lib/accounting/posting";

/**
 * Close an accounting period after month-end checklist + TB balance check.
 * Malaysian firm practice: Manager / Partner signs off month-end before lock.
 */
export async function closeAccountingPeriod(input: {
  companyId: string;
  periodId: string;
  actorUserId: string;
  force?: boolean;
}) {
  const period = await db.accountingPeriod.findFirst({
    where: { id: input.periodId, companyId: input.companyId }
  });
  if (!period) throw new PostingError("Period not found.");
  if (period.isClosed) throw new PostingError("Period is already closed.");

  const run = await db.monthEndRun.findFirst({
    where: { companyId: input.companyId, periodId: input.periodId },
    include: { tasks: true },
    orderBy: { createdAt: "desc" }
  });

  const score = run ? calculateCompletionScore(run.tasks) : 0;
  if (!input.force && score < 100) {
    throw new PostingError(
      `Month-end checklist is ${score}% complete. Finish all tasks (or force-close as Boss).`
    );
  }

  const tb = await getTrialBalance(input.companyId, { periodId: input.periodId });
  if (!tb.balanced) {
    throw new PostingError(
      `Trial balance is not balanced (Dr ${tb.totalDebit} / Cr ${tb.totalCredit}). Fix before close.`
    );
  }

  const updated = await db.accountingPeriod.update({
    where: { id: period.id },
    data: { isClosed: true }
  });

  if (run) {
    await db.monthEndRun.update({
      where: { id: run.id },
      data: { completionScore: score }
    });
  }

  await writeAuditEvent({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    entityType: "AccountingPeriod",
    entityId: period.id,
    action: "CLOSE_PERIOD",
    afterJson: {
      startDate: period.startDate,
      endDate: period.endDate,
      completionScore: score,
      forced: Boolean(input.force)
    }
  });

  return { period: updated, completionScore: score, trialBalance: tb };
}

export async function reopenAccountingPeriod(input: {
  companyId: string;
  periodId: string;
  actorUserId: string;
}) {
  const period = await db.accountingPeriod.findFirst({
    where: { id: input.periodId, companyId: input.companyId }
  });
  if (!period) throw new PostingError("Period not found.");
  if (!period.isClosed) throw new PostingError("Period is not closed.");

  const updated = await db.accountingPeriod.update({
    where: { id: period.id },
    data: { isClosed: false }
  });

  await writeAuditEvent({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    entityType: "AccountingPeriod",
    entityId: period.id,
    action: "REOPEN_PERIOD",
    afterJson: { startDate: period.startDate, endDate: period.endDate }
  });

  return { period: updated };
}
