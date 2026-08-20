import { db } from "@/lib/db";
import type { CreateJournalInput } from "@/lib/accounting/types";

export class PostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostingError";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function validateJournalBalanced(lines: CreateJournalInput["lines"]): void {
  if (lines.length < 2) {
    throw new PostingError("Journal entry must contain at least two lines.");
  }

  const totalDebit = round2(lines.reduce((sum, line) => sum + (line.debit ?? 0), 0));
  const totalCredit = round2(lines.reduce((sum, line) => sum + (line.credit ?? 0), 0));

  if (totalDebit <= 0 || totalCredit <= 0) {
    throw new PostingError("Journal entry must have positive debit and credit totals.");
  }

  if (totalDebit !== totalCredit) {
    throw new PostingError(
      `Journal not balanced. Debit ${totalDebit.toFixed(2)} != Credit ${totalCredit.toFixed(2)}`
    );
  }
}

export async function ensurePeriodOpen(companyId: string, journalDate: Date): Promise<void> {
  const period = await db.accountingPeriod.findFirst({
    where: {
      companyId,
      startDate: { lte: journalDate },
      endDate: { gte: journalDate }
    }
  });

  if (period?.isClosed) {
    throw new PostingError("Posting blocked. Accounting period is closed.");
  }
}

export async function createAndPostJournal(input: CreateJournalInput) {
  const journalDate = new Date(input.journalDate);

  if (Number.isNaN(journalDate.getTime())) {
    throw new PostingError("Invalid journal date.");
  }

  validateJournalBalanced(input.lines);
  await ensurePeriodOpen(input.companyId, journalDate);

  const entry = await db.journalEntry.create({
    data: {
      companyId: input.companyId,
      sourceDocumentId: input.sourceDocumentId,
      journalDate,
      journalNumber: input.journalNumber,
      description: input.description,
      status: "POSTED",
      postedAt: new Date(),
      lines: {
        create: input.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit ?? 0,
          credit: line.credit ?? 0,
          memo: line.memo
        }))
      }
    },
    include: {
      lines: true
    }
  });

  return entry;
}
