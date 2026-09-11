import { db } from "@/lib/db";
import { round2 } from "@/lib/accounting/helpers";
import { getTrialBalance } from "@/lib/accounting/trial-balance";
import { getSstTaxPack } from "@/lib/tax/sst-summary";
import type { DocumentCategory, DocumentPipelineStatus } from "@prisma/client";

const CATEGORIES: DocumentCategory[] = [
  "BANK",
  "SALES",
  "PURCHASE",
  "PAYROLL",
  "TAX",
  "OTHER"
];

const PENDING_STATUSES: DocumentPipelineStatus[] = [
  "UPLOADED",
  "AI_PROCESSED",
  "NEEDS_CLIENT",
  "IN_REVIEW"
];

/**
 * Single source of truth for the accountant "Books & Balance" view:
 * count documents → post totals → trial balance → balance check → tax position.
 */
export async function getBooksOverview(companyId: string, periodId?: string) {
  const period = periodId
    ? await db.accountingPeriod.findFirst({ where: { id: periodId, companyId } })
    : await db.accountingPeriod.findFirst({
        where: { companyId },
        orderBy: { startDate: "desc" }
      });

  const dateFilter =
    period ? { gte: period.startDate, lte: period.endDate } : undefined;

  const [tb, docsByCategory, docsByStatus, journals, tax] = await Promise.all([
    getTrialBalance(companyId, { periodId: period?.id }),
    db.sourceDocument.groupBy({
      by: ["category"],
      where: { companyId, ...(period ? { periodId: period.id } : {}) },
      _count: { _all: true },
      _sum: { aiConfidence: true }
    }),
    db.sourceDocument.groupBy({
      by: ["status"],
      where: { companyId, ...(period ? { periodId: period.id } : {}) },
      _count: { _all: true }
    }),
    db.journalEntry.findMany({
      where: {
        companyId,
        status: "POSTED",
        ...(dateFilter ? { journalDate: dateFilter } : {})
      },
      include: { lines: { include: { account: true } } }
    }),
    getSstTaxPack(companyId, period?.id)
  ]);

  let revenue = 0;
  let expenses = 0;
  for (const je of journals) {
    for (const line of je.lines) {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      if (line.account.type === "REVENUE") revenue += credit - debit;
      if (line.account.type === "EXPENSE") expenses += debit - credit;
    }
  }
  revenue = round2(revenue);
  expenses = round2(expenses);

  const byCategory: Record<string, number> = {};
  for (const c of CATEGORIES) byCategory[c] = 0;
  for (const row of docsByCategory) byCategory[row.category] = row._count._all;

  const byStatus: Record<string, number> = {};
  for (const row of docsByStatus) byStatus[row.status] = row._count._all;

  const totalDocs = Object.values(byStatus).reduce((s, n) => s + n, 0);
  const pendingReview = PENDING_STATUSES.reduce((s, st) => s + (byStatus[st] ?? 0), 0);
  const postedDocs = byStatus.POSTED ?? 0;

  const postedJournals = journals.length;

  return {
    period,
    balance: {
      rows: tb.rows,
      totalDebit: tb.totalDebit,
      totalCredit: tb.totalCredit,
      balanced: tb.balanced,
      difference: round2(tb.totalDebit - tb.totalCredit)
    },
    documents: {
      total: totalDocs,
      byCategory,
      byStatus,
      pendingReview,
      posted: postedDocs
    },
    books: {
      postedJournals,
      revenue,
      expenses,
      profit: round2(revenue - expenses)
    },
    tax: {
      outputTax: tax.sst.outputTax,
      inputTax: tax.sst.inputTax,
      netPayable: tax.sst.netPayable,
      sstRegistered: tax.settings.sstRegistered
    }
  };
}
