import { db } from "@/lib/db";
import { round2 } from "@/lib/accounting/helpers";

/**
 * SST / tax pack summary for Malaysian SME clients.
 * Uses posted journals on Input Tax (5950) and SST Payable (2400).
 */
export async function getSstTaxPack(companyId: string, periodId?: string) {
  const settings = await db.taxSettings.findUnique({ where: { companyId } });
  const period = periodId
    ? await db.accountingPeriod.findFirst({ where: { id: periodId, companyId } })
    : await db.accountingPeriod.findFirst({
        where: { companyId },
        orderBy: { startDate: "desc" }
      });

  const dateFilter = period
    ? { journalDate: { gte: period.startDate, lte: period.endDate } }
    : {};

  const journals = await db.journalEntry.findMany({
    where: { companyId, status: "POSTED", ...dateFilter },
    include: { lines: { include: { account: true } } }
  });

  let inputTax = 0;
  let outputTax = 0;

  for (const je of journals) {
    for (const line of je.lines) {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      if (line.account.code === "5950") inputTax += debit - credit;
      if (line.account.code === "2400") outputTax += credit - debit;
    }
  }

  inputTax = round2(inputTax);
  outputTax = round2(outputTax);
  const netPayable = round2(outputTax - inputTax);

  const salesWithTax = await db.salesInvoice.aggregate({
    where: {
      companyId,
      ...(period
        ? { invoiceDate: { gte: period.startDate, lte: period.endDate } }
        : {}),
      taxAmount: { gt: 0 }
    },
    _sum: { taxAmount: true, subtotal: true, total: true },
    _count: true
  });

  const purchasesWithTax = await db.purchaseBill.aggregate({
    where: {
      companyId,
      ...(period
        ? { billDate: { gte: period.startDate, lte: period.endDate } }
        : {}),
      taxAmount: { gt: 0 }
    },
    _sum: { taxAmount: true, subtotal: true, total: true },
    _count: true
  });

  return {
    settings: settings ?? {
      sstRegistered: false,
      sstNumber: null,
      taxRegistrationNo: null,
      defaultTaxCode: null
    },
    period,
    sst: {
      outputTax,
      inputTax,
      netPayable,
      status: netPayable >= 0 ? "payable_to_customs" : "refund_claim"
    },
    schedules: {
      taxableSales: {
        count: salesWithTax._count,
        subtotal: round2(Number(salesWithTax._sum.subtotal ?? 0)),
        tax: round2(Number(salesWithTax._sum.taxAmount ?? 0)),
        total: round2(Number(salesWithTax._sum.total ?? 0))
      },
      taxablePurchases: {
        count: purchasesWithTax._count,
        subtotal: round2(Number(purchasesWithTax._sum.subtotal ?? 0)),
        tax: round2(Number(purchasesWithTax._sum.taxAmount ?? 0)),
        total: round2(Number(purchasesWithTax._sum.total ?? 0))
      }
    },
    checklist: [
      {
        key: "sst_registration",
        label: "Confirm SST registration / number",
        done: Boolean(settings?.sstRegistered && settings.sstNumber)
      },
      {
        key: "output_tax",
        label: "Reconcile SST output (sales) to 2400",
        done: outputTax >= 0
      },
      {
        key: "input_tax",
        label: "Reconcile SST input (purchases) to 5950",
        done: inputTax >= 0
      },
      {
        key: "net_position",
        label: "Compute net SST payable / refund",
        done: true
      },
      {
        key: "einvoice",
        label: "e-Invoice / LHDN MyInvois readiness (manual for now)",
        done: false
      }
    ]
  };
}
