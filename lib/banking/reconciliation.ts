import { db } from "@/lib/db";
import { round2 } from "@/lib/accounting/helpers";

export type ImportBankTxn = {
  txnDate: string;
  amount: number;
  description?: string;
  reference?: string;
};

function inferType(amount: number): "DEPOSIT" | "WITHDRAWAL" {
  return amount >= 0 ? "DEPOSIT" : "WITHDRAWAL";
}

export async function importBankTransactions(
  bankAccountId: string,
  transactions: ImportBankTxn[]
) {
  const created = await db.bankTransaction.createMany({
    data: transactions.map((txn) => {
      const amount = round2(txn.amount);
      return {
        bankAccountId,
        txnDate: new Date(txn.txnDate),
        amount: Math.abs(amount),
        type: inferType(amount),
        description: txn.description,
        reference: txn.reference,
        matchStatus: "UNMATCHED"
      };
    })
  });

  return created;
}

export async function autoMatchBankTransactions(companyId: string, bankAccountId: string) {
  const account = await db.bankAccount.findFirst({
    where: { id: bankAccountId, companyId }
  });

  if (!account) {
    throw new Error("Bank account not found.");
  }

  const unmatched = await db.bankTransaction.findMany({
    where: {
      bankAccountId,
      matchStatus: { in: ["UNMATCHED", "SUGGESTED"] }
    }
  });

  const openInvoices = await db.salesInvoice.findMany({
    where: { companyId, status: { in: ["OPEN", "PARTIAL", "PAID"] } },
    include: { customer: true }
  });

  const openBills = await db.purchaseBill.findMany({
    where: { companyId, status: { in: ["OPEN", "PARTIAL", "PAID"] } },
    include: { supplier: true }
  });

  const receipts = await db.arReceipt.findMany({ where: { companyId } });
  const payments = await db.apPayment.findMany({ where: { companyId } });

  let autoMatched = 0;
  let needsReview = 0;
  const suggestions: Array<{
    bankTransactionId: string;
    matchType: string;
    matchedDocumentId: string;
    confidence: number;
  }> = [];

  for (const txn of unmatched) {
    const amount = Number(txn.amount);
    let best:
      | {
          matchType: string;
          matchedDocumentId: string;
          confidence: number;
        }
      | null = null;

    if (txn.type === "DEPOSIT") {
      for (const receipt of receipts) {
        if (Number(receipt.amount) === amount) {
          best = {
            matchType: "AR_RECEIPT",
            matchedDocumentId: receipt.id,
            confidence: 98
          };
          break;
        }
      }

      if (!best) {
        for (const inv of openInvoices) {
          if (Number(inv.total) === amount) {
            best = {
              matchType: "SALES_INVOICE",
              matchedDocumentId: inv.id,
              confidence: 90
            };
            break;
          }
        }
      }
    }

    if (txn.type === "WITHDRAWAL") {
      for (const payment of payments) {
        if (Number(payment.amount) === amount) {
          best = {
            matchType: "AP_PAYMENT",
            matchedDocumentId: payment.id,
            confidence: 98
          };
          break;
        }
      }

      if (!best) {
        for (const bill of openBills) {
          if (Number(bill.total) === amount) {
            best = {
              matchType: "PURCHASE_BILL",
              matchedDocumentId: bill.id,
              confidence: 90
            };
            break;
          }
        }
      }
    }

    if (best) {
      await db.reconciliationMatch.create({
        data: {
          bankTransactionId: txn.id,
          matchType: best.matchType,
          matchedDocumentId: best.matchedDocumentId,
          confidence: best.confidence,
          status: best.confidence >= 95 ? "MATCHED" : "SUGGESTED"
        }
      });

      await db.bankTransaction.update({
        where: { id: txn.id },
        data: { matchStatus: best.confidence >= 95 ? "MATCHED" : "SUGGESTED" }
      });

      suggestions.push({ bankTransactionId: txn.id, ...best });

      if (best.confidence >= 95) autoMatched += 1;
      else needsReview += 1;
    } else {
      needsReview += 1;
    }
  }

  return {
    scanned: unmatched.length,
    autoMatched,
    needsReview,
    suggestions,
    summary: `I found ${autoMatched} matches automatically. ${needsReview} transactions require review.`
  };
}

export async function getReconciliationSummary(companyId: string, bankAccountId: string) {
  const account = await db.bankAccount.findFirst({
    where: { id: bankAccountId, companyId },
    include: {
      transactions: {
        include: { matches: true },
        orderBy: { txnDate: "desc" }
      }
    }
  });

  if (!account) return null;

  const matched = account.transactions.filter((t) => t.matchStatus === "MATCHED").length;
  const suggested = account.transactions.filter((t) => t.matchStatus === "SUGGESTED").length;
  const unmatched = account.transactions.filter((t) => t.matchStatus === "UNMATCHED").length;

  return {
    account,
    matched,
    suggested,
    unmatched,
    total: account.transactions.length
  };
}
