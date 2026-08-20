import { db } from "@/lib/db";
import { PostingError } from "@/lib/accounting/posting";

export async function getAccountByCode(companyId: string, code: string) {
  const account = await db.account.findUnique({
    where: { companyId_code: { companyId, code } }
  });

  if (!account) {
    throw new PostingError(`Account ${code} not found for company.`);
  }

  return account;
}

export async function nextDocNumber(
  companyId: string,
  prefix: string,
  field: "invoice" | "receipt" | "bill" | "payment" | "journal"
): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  if (field === "invoice") {
    const count = await db.salesInvoice.count({ where: { companyId } });
    return `${prefix}-${stamp}-${String(count + 1).padStart(4, "0")}`;
  }

  if (field === "receipt") {
    const count = await db.arReceipt.count({ where: { companyId } });
    return `${prefix}-${stamp}-${String(count + 1).padStart(4, "0")}`;
  }

  if (field === "bill") {
    const count = await db.purchaseBill.count({ where: { companyId } });
    return `${prefix}-${stamp}-${String(count + 1).padStart(4, "0")}`;
  }

  if (field === "payment") {
    const count = await db.apPayment.count({ where: { companyId } });
    return `${prefix}-${stamp}-${String(count + 1).padStart(4, "0")}`;
  }

  const count = await db.journalEntry.count({ where: { companyId } });
  return `${prefix}-${stamp}-${String(count + 1).padStart(4, "0")}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function agingBucket(dueDate: Date, asOf = new Date()): string {
  const days = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}
