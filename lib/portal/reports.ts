import { db } from "@/lib/db";
import { round2 } from "@/lib/accounting/helpers";

export async function buildClientMonthlyReport(companyId: string, periodId: string) {
  const period = await db.accountingPeriod.findFirst({
    where: { id: periodId, companyId }
  });
  if (!period) throw new Error("Period not found.");

  const docs = await db.sourceDocument.findMany({
    where: { companyId, periodId }
  });

  const journals = await db.journalEntry.findMany({
    where: {
      companyId,
      status: "POSTED",
      journalDate: { gte: period.startDate, lte: period.endDate }
    },
    include: { lines: { include: { account: true } } }
  });

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

  const openInvoices = await db.salesInvoice.findMany({
    where: { companyId, status: { in: ["OPEN", "PARTIAL"] } }
  });
  const openBills = await db.purchaseBill.findMany({
    where: { companyId, status: { in: ["OPEN", "PARTIAL"] } }
  });

  const ar = openInvoices.reduce((s, i) => s + Number(i.total) - Number(i.amountPaid), 0);
  const ap = openBills.reduce((s, b) => s + Number(b.total) - Number(b.amountPaid), 0);

  const postedDocs = docs.filter((d) => d.status === "POSTED").length;
  const needsClient = docs.filter((d) => d.status === "NEEDS_CLIENT").length;
  const inReview = docs.filter((d) => d.status === "IN_REVIEW" || d.status === "UPLOADED").length;

  const summary = {
    period: {
      id: period.id,
      startDate: period.startDate,
      endDate: period.endDate
    },
    profitAndLoss: {
      revenue: round2(revenue),
      expenses: round2(expenses),
      profit: round2(revenue - expenses)
    },
    outstanding: {
      receivables: round2(ar),
      payables: round2(ap)
    },
    processing: {
      documentsTotal: docs.length,
      posted: postedDocs,
      inReview,
      needsClientAction: needsClient
    },
    plainLanguage: {
      headline:
        revenue - expenses >= 0
          ? `This month your estimated profit is RM${round2(revenue - expenses).toFixed(2)}.`
          : `This month your estimated loss is RM${Math.abs(round2(revenue - expenses)).toFixed(2)}.`,
      cashTip:
        ap > ar
          ? "Supplier bills outstanding are higher than customer invoices — watch cash flow."
          : "Customer invoices outstanding look manageable versus supplier bills."
    }
  };

  const snapshot = await db.reportSnapshot.upsert({
    where: { companyId_periodId: { companyId, periodId } },
    create: {
      companyId,
      periodId,
      title: `Monthly report ${period.startDate.toISOString().slice(0, 7)}`,
      status: "READY",
      summaryJson: summary,
      publishedAt: new Date()
    },
    update: {
      summaryJson: summary,
      status: "READY",
      publishedAt: new Date()
    }
  });

  return { snapshot, summary };
}
