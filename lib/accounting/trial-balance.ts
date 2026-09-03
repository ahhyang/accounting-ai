import { db } from "@/lib/db";
import { round2 } from "@/lib/accounting/helpers";

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
};

/** Build trial balance from posted journals (optionally within a period). */
export async function getTrialBalance(
  companyId: string,
  options?: { periodId?: string; asOf?: Date }
) {
  const period = options?.periodId
    ? await db.accountingPeriod.findFirst({
        where: { id: options.periodId, companyId }
      })
    : null;

  const journals = await db.journalEntry.findMany({
    where: {
      companyId,
      status: "POSTED",
      ...(period
        ? { journalDate: { gte: period.startDate, lte: period.endDate } }
        : options?.asOf
          ? { journalDate: { lte: options.asOf } }
          : {})
    },
    include: { lines: { include: { account: true } } }
  });

  const map = new Map<string, TrialBalanceRow>();

  for (const je of journals) {
    for (const line of je.lines) {
      const key = line.accountId;
      const row = map.get(key) ?? {
        accountId: line.accountId,
        code: line.account.code,
        name: line.account.name,
        type: line.account.type,
        debit: 0,
        credit: 0
      };
      row.debit = round2(row.debit + Number(line.debit));
      row.credit = round2(row.credit + Number(line.credit));
      map.set(key, row);
    }
  }

  const rows = Array.from(map.values())
    .map((r) => {
      const net = round2(r.debit - r.credit);
      return {
        ...r,
        debit: net > 0 ? net : 0,
        credit: net < 0 ? Math.abs(net) : 0
      };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));

  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    period
  };
}
