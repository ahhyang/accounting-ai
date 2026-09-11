import { db } from "@/lib/db";
import { round2 } from "@/lib/accounting/helpers";
import { getTrialBalance } from "@/lib/accounting/trial-balance";
import { calculateCompletionScore } from "@/lib/accounting/month-end";
import { findDuplicateBills } from "@/lib/ap/service";
import { getSstTaxPack } from "@/lib/tax/sst-summary";

export type ClientPortfolioRow = {
  companyId: string;
  name: string;
  registrationNumber: string | null;
  industry: string | null;
  engagement: {
    status: string;
    billingStatus: string;
    accountingFee: number | null;
    amountDue: number | null;
    dueDate: string | null;
    invoiceNumber: string | null;
    lastPaymentDate: string | null;
    notes: string | null;
  };
  progress: {
    periodId: string | null;
    periodLabel: string;
    periodClosed: boolean;
    documentsTotal: number;
    documentsPosted: number;
    documentsPending: number;
    monthEndCompletion: number;
    tbBalanced: boolean;
    postedJournals: number;
    outstandingAR: number;
    outstandingAP: number;
  };
  tax: { sstRegistered: boolean; sstNetPayable: number };
  audit: {
    readinessScore: number;
    goingConcernFlags: number;
    duplicateBillGroups: number;
    bankUnmatched: number;
  };
};

function periodLabel(start: Date, end: Date) {
  return `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`;
}

async function buildClientRow(company: {
  id: string;
  name: string;
  registrationNumber: string | null;
  industry: string | null;
}): Promise<ClientPortfolioRow> {
  const companyId = company.id;

  const period = await db.accountingPeriod.findFirst({
    where: { companyId },
    orderBy: { startDate: "desc" }
  });

  const [engagement, docGroups, monthEnd, arInvoices, apBills, duplicates, banks, taxPack] =
    await Promise.all([
      db.clientEngagement.findUnique({ where: { companyId } }),
      db.sourceDocument.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
      db.monthEndRun.findFirst({
        where: { companyId },
        include: { tasks: true },
        orderBy: { createdAt: "desc" }
      }),
      db.salesInvoice.findMany({
        where: { companyId, status: { in: ["OPEN", "PARTIAL"] } },
        select: { total: true, amountPaid: true }
      }),
      db.purchaseBill.findMany({
        where: { companyId, status: { in: ["OPEN", "PARTIAL"] } },
        select: { total: true, amountPaid: true }
      }),
      findDuplicateBills(companyId),
      db.bankAccount.findMany({
        where: { companyId },
        include: { transactions: { select: { matchStatus: true } } }
      }),
      getSstTaxPack(companyId, period?.id)
    ]);

  const tb = await getTrialBalance(companyId, { periodId: period?.id });

  const byStatus: Record<string, number> = {};
  for (const g of docGroups) byStatus[g.status] = g._count._all;
  const documentsTotal = Object.values(byStatus).reduce((s, n) => s + n, 0);
  const documentsPosted = byStatus.POSTED ?? 0;
  const documentsPending =
    (byStatus.UPLOADED ?? 0) +
    (byStatus.AI_PROCESSED ?? 0) +
    (byStatus.IN_REVIEW ?? 0) +
    (byStatus.NEEDS_CLIENT ?? 0);

  const outstandingAR = round2(
    arInvoices.reduce((s, i) => s + Number(i.total) - Number(i.amountPaid), 0)
  );
  const outstandingAP = round2(
    apBills.reduce((s, b) => s + Number(b.total) - Number(b.amountPaid), 0)
  );

  const postedJournals = await db.journalEntry.count({
    where: { companyId, status: "POSTED" }
  });

  const monthEndCompletion = monthEnd ? calculateCompletionScore(monthEnd.tasks) : 0;
  const bankUnmatched = banks.reduce(
    (s, a) => s + a.transactions.filter((t) => t.matchStatus === "UNMATCHED").length,
    0
  );

  let goingConcernFlags = 0;
  if (!tb.balanced) goingConcernFlags += 0;
  const revenue = round2(
    tb.rows.filter((r) => r.type === "REVENUE").reduce((s, r) => s + r.credit - r.debit, 0)
  );
  const expenses = round2(
    tb.rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + r.debit - r.credit, 0)
  );
  const totalAssets = round2(tb.rows.filter((r) => r.type === "ASSET").reduce((s, r) => s + r.debit, 0));
  const totalLiabilities = round2(
    tb.rows.filter((r) => r.type === "LIABILITY").reduce((s, r) => s + r.credit, 0)
  );
  if (totalAssets - totalLiabilities < 0) goingConcernFlags += 1;
  if (revenue - expenses < 0) goingConcernFlags += 1;

  // Light readiness score.
  let score = 100;
  if (!tb.balanced) score -= 30;
  if (documentsPending > 5) score -= 20;
  else if (documentsPending > 0) score -= 10;
  if (duplicates.length > 0) score -= 10;
  if (bankUnmatched > 0) score -= 10;
  if (!period?.isClosed) score -= 10;
  if (goingConcernFlags > 0) score -= 15;
  score = Math.max(0, score);

  return {
    companyId,
    name: company.name,
    registrationNumber: company.registrationNumber,
    industry: company.industry,
    engagement: {
      status: engagement?.engagementStatus ?? "ONBOARDING",
      billingStatus: engagement?.billingStatus ?? "NOT_BILLED",
      accountingFee: engagement?.accountingFee != null ? Number(engagement.accountingFee) : null,
      amountDue: engagement?.amountDue != null ? Number(engagement.amountDue) : null,
      dueDate: engagement?.dueDate ? engagement.dueDate.toISOString().slice(0, 10) : null,
      invoiceNumber: engagement?.invoiceNumber ?? null,
      lastPaymentDate: engagement?.lastPaymentDate
        ? engagement.lastPaymentDate.toISOString().slice(0, 10)
        : null,
      notes: engagement?.notes ?? null
    },
    progress: {
      periodId: period?.id ?? null,
      periodLabel: period ? periodLabel(period.startDate, period.endDate) : "No period",
      periodClosed: period?.isClosed ?? false,
      documentsTotal,
      documentsPosted,
      documentsPending,
      monthEndCompletion,
      tbBalanced: tb.balanced,
      postedJournals,
      outstandingAR,
      outstandingAP
    },
    tax: {
      sstRegistered: taxPack.settings.sstRegistered,
      sstNetPayable: taxPack.sst.netPayable
    },
    audit: {
      readinessScore: score,
      goingConcernFlags,
      duplicateBillGroups: duplicates.length,
      bankUnmatched
    }
  };
}

export async function getFirmPortfolio() {
  const companies = await db.company.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, registrationNumber: true, industry: true }
  });

  const clients = await Promise.all(companies.map((c) => buildClientRow(c)));

  const billing = {
    paid: clients.filter((c) => c.engagement.billingStatus === "PAID").length,
    invoiced: clients.filter((c) => c.engagement.billingStatus === "INVOICED").length,
    overdue: clients.filter((c) => c.engagement.billingStatus === "OVERDUE").length,
    notBilled: clients.filter((c) => c.engagement.billingStatus === "NOT_BILLED").length,
    totalDue: round2(
      clients.reduce((s, c) => s + (c.engagement.amountDue ?? 0), 0)
    )
  };

  const firm = {
    clientCount: clients.length,
    documentsTotal: clients.reduce((s, c) => s + c.progress.documentsTotal, 0),
    documentsPending: clients.reduce((s, c) => s + c.progress.documentsPending, 0),
    documentsPosted: clients.reduce((s, c) => s + c.progress.documentsPosted, 0),
    totalAR: round2(clients.reduce((s, c) => s + c.progress.outstandingAR, 0)),
    totalAP: round2(clients.reduce((s, c) => s + c.progress.outstandingAP, 0)),
    postedJournals: clients.reduce((s, c) => s + c.progress.postedJournals, 0),
    billing,
    tax: {
      sstRegisteredCount: clients.filter((c) => c.tax.sstRegistered).length,
      sstNetTotal: round2(clients.reduce((s, c) => s + c.tax.sstNetPayable, 0))
    },
    audit: {
      balancedClients: clients.filter((c) => c.progress.tbBalanced).length,
      unbalancedClients: clients.filter((c) => !c.progress.tbBalanced).length,
      goingConcernClients: clients.filter((c) => c.audit.goingConcernFlags > 0).length,
      duplicateGroups: clients.reduce((s, c) => s + c.audit.duplicateBillGroups, 0),
      clientsWithPendingDocs: clients.filter((c) => c.progress.documentsPending > 0).length
    },
    monthEnd: {
      closedPeriods: clients.filter((c) => c.progress.periodClosed).length,
      avgCompletion: clients.length
        ? Math.round(
            clients.reduce((s, c) => s + c.progress.monthEndCompletion, 0) / clients.length
          )
        : 0
    }
  };

  return { clients, firm };
}

/** Client-facing company dashboard summary. */
export async function getClientDashboard(companyId: string) {
  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Company not found.");

  const period = await db.accountingPeriod.findFirst({
    where: { companyId },
    orderBy: { startDate: "desc" }
  });

  const tb = await getTrialBalance(companyId, { periodId: period?.id });
  const revenue = round2(
    tb.rows.filter((r) => r.type === "REVENUE").reduce((s, r) => s + r.credit - r.debit, 0)
  );
  const expenses = round2(
    tb.rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + r.debit - r.credit, 0)
  );

  const [docGroups, report, arInvoices, apBills] = await Promise.all([
    db.sourceDocument.groupBy({
      by: ["category"],
      where: { companyId, ...(period ? { periodId: period.id } : {}) },
      _count: { _all: true }
    }),
    period
      ? db.reportSnapshot.findFirst({ where: { companyId, periodId: period.id } })
      : null,
    db.salesInvoice.findMany({
      where: { companyId, status: { in: ["OPEN", "PARTIAL"] } },
      select: { total: true, amountPaid: true }
    }),
    db.purchaseBill.findMany({
      where: { companyId, status: { in: ["OPEN", "PARTIAL"] } },
      select: { total: true, amountPaid: true }
    })
  ]);

  const byCategory: Record<string, number> = {};
  for (const g of docGroups) byCategory[g.category] = g._count._all;

  return {
    company: {
      id: company.id,
      name: company.name,
      registrationNumber: company.registrationNumber,
      industry: company.industry,
      currency: company.functionalCurrency
    },
    period: period
      ? {
          id: period.id,
          label: periodLabel(period.startDate, period.endDate),
          isClosed: period.isClosed
        }
      : null,
    financials: {
      revenue,
      expenses,
      profit: round2(revenue - expenses),
      balanced: tb.balanced,
      outstandingAR: round2(
        arInvoices.reduce((s, i) => s + Number(i.total) - Number(i.amountPaid), 0)
      ),
      outstandingAP: round2(
        apBills.reduce((s, b) => s + Number(b.total) - Number(b.amountPaid), 0)
      )
    },
    documents: { total: Object.values(byCategory).reduce((s, n) => s + n, 0), byCategory },
    report: report
      ? { status: report.status, publishedAt: report.publishedAt, summary: report.summaryJson }
      : null
  };
}
