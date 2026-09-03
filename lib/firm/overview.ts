import { db } from "@/lib/db";
import { round2 } from "@/lib/accounting/helpers";
import { calculateCompletionScore } from "@/lib/accounting/month-end";
import { findDuplicateBills } from "@/lib/ap/service";

/** Firm-level oversight for Boss / Manager — Malaysian practice firm dashboard */
export async function getFirmOverview(companyId: string) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    include: {
      periods: { orderBy: { startDate: "desc" }, take: 3 },
      users: { include: { user: true, role: true } }
    }
  });
  if (!company) throw new Error("Company not found.");

  const period = company.periods[0];

  const [docs, journals, openAr, openAp, duplicates, monthEnd] = await Promise.all([
    db.sourceDocument.groupBy({
      by: ["status"],
      where: { companyId },
      _count: true
    }),
    db.journalEntry.count({ where: { companyId, status: "POSTED" } }),
    db.salesInvoice.findMany({
      where: { companyId, status: { in: ["OPEN", "PARTIAL"] } }
    }),
    db.purchaseBill.findMany({
      where: { companyId, status: { in: ["OPEN", "PARTIAL"] } }
    }),
    findDuplicateBills(companyId),
    period
      ? db.monthEndRun.findFirst({
          where: { companyId, periodId: period.id },
          include: { tasks: true },
          orderBy: { createdAt: "desc" }
        })
      : null
  ]);

  const docCounts = Object.fromEntries(docs.map((d) => [d.status, d._count]));
  const ar = round2(openAr.reduce((s, i) => s + Number(i.total) - Number(i.amountPaid), 0));
  const ap = round2(openAp.reduce((s, b) => s + Number(b.total) - Number(b.amountPaid), 0));
  const monthEndScore = monthEnd ? calculateCompletionScore(monthEnd.tasks) : 0;

  return {
    company: { id: company.id, name: company.name, baseCurrency: company.baseCurrency },
    period,
    team: company.users.map((m) => ({
      name: m.user.name,
      email: m.user.email,
      role: m.role.name,
      isOwner: m.isOwner
    })),
    kpis: {
      postedJournals: journals,
      documentsInReview: (docCounts.IN_REVIEW ?? 0) + (docCounts.UPLOADED ?? 0),
      waitingOnClient: docCounts.NEEDS_CLIENT ?? 0,
      postedDocuments: docCounts.POSTED ?? 0,
      outstandingAR: ar,
      outstandingAP: ap,
      duplicateBillGroups: duplicates.length,
      monthEndCompletion: monthEndScore,
      periodClosed: period?.isClosed ?? false
    },
    workflow: [
      { step: "Client uploads", owner: "Client", status: "active" },
      { step: "Bookkeeping / AI review", owner: "Accountant", status: "active" },
      { step: "Tax pack (SST)", owner: "Tax", status: "active" },
      { step: "Audit readiness", owner: "Audit", status: "active" },
      { step: "Month-end close", owner: "Manager", status: monthEndScore >= 100 ? "ready" : "in_progress" },
      { step: "Partner oversight", owner: "Boss", status: "active" }
    ]
  };
}
