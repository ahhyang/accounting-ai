import { db } from "@/lib/db";
import { createAndPostJournal, PostingError } from "@/lib/accounting/posting";
import { getAccountByCode, nextDocNumber, round2 } from "@/lib/accounting/helpers";

export type CreateBillInput = {
  companyId: string;
  supplierId: string;
  billDate: string;
  dueDate: string;
  description?: string;
  subtotal: number;
  taxAmount?: number;
  billNumber?: string;
};

export async function createPurchaseBill(input: CreateBillInput) {
  const tax = round2(input.taxAmount ?? 0);
  const subtotal = round2(input.subtotal);
  const total = round2(subtotal + tax);

  if (total <= 0) throw new PostingError("Bill total must be positive.");

  const ap = await getAccountByCode(input.companyId, "2100");
  const expense = await getAccountByCode(input.companyId, "5600");
  const inputTax = tax > 0 ? await getAccountByCode(input.companyId, "5950") : null;

  const billNumber = input.billNumber ?? (await nextDocNumber(input.companyId, "BILL", "bill"));
  const journalNumber = await nextDocNumber(input.companyId, "JE", "journal");

  const lines = [
    { accountId: expense.id, debit: subtotal, memo: "Purchase / expense" },
    { accountId: ap.id, credit: total, memo: `Bill ${billNumber}` }
  ];

  if (tax > 0 && inputTax) {
    lines.splice(1, 0, { accountId: inputTax.id, debit: tax, memo: "Input tax" });
  }

  const journal = await createAndPostJournal({
    companyId: input.companyId,
    journalDate: input.billDate,
    journalNumber,
    description: input.description ?? `Purchase bill ${billNumber}`,
    lines
  });

  const bill = await db.purchaseBill.create({
    data: {
      companyId: input.companyId,
      supplierId: input.supplierId,
      billNumber,
      billDate: new Date(input.billDate),
      dueDate: new Date(input.dueDate),
      description: input.description,
      subtotal,
      taxAmount: tax,
      total,
      status: "OPEN",
      journalEntryId: journal.id
    },
    include: { supplier: true }
  });

  return { bill, journal };
}

export type CreateApPaymentInput = {
  companyId: string;
  supplierId: string;
  paymentDate: string;
  amount: number;
  billId: string;
  reference?: string;
};

export async function createApPayment(input: CreateApPaymentInput) {
  const amount = round2(input.amount);
  if (amount <= 0) throw new PostingError("Payment amount must be positive.");

  const bill = await db.purchaseBill.findFirst({
    where: { id: input.billId, companyId: input.companyId, supplierId: input.supplierId }
  });

  if (!bill) throw new PostingError("Bill not found.");

  const outstanding = round2(Number(bill.total) - Number(bill.amountPaid));
  if (amount > outstanding) {
    throw new PostingError(`Allocation exceeds outstanding balance of ${outstanding.toFixed(2)}.`);
  }

  const bank = await getAccountByCode(input.companyId, "1200");
  const ap = await getAccountByCode(input.companyId, "2100");
  const paymentNumber = await nextDocNumber(input.companyId, "PAY", "payment");
  const journalNumber = await nextDocNumber(input.companyId, "JE", "journal");

  const journal = await createAndPostJournal({
    companyId: input.companyId,
    journalDate: input.paymentDate,
    journalNumber,
    description: `Payment ${paymentNumber} for ${bill.billNumber}`,
    lines: [
      { accountId: ap.id, debit: amount, memo: `Clear AP ${bill.billNumber}` },
      { accountId: bank.id, credit: amount, memo: "Supplier payment" }
    ]
  });

  const newPaid = round2(Number(bill.amountPaid) + amount);
  const status = newPaid >= Number(bill.total) ? "PAID" : "PARTIAL";

  const payment = await db.$transaction(async (tx) => {
    const created = await tx.apPayment.create({
      data: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        paymentNumber,
        paymentDate: new Date(input.paymentDate),
        amount,
        reference: input.reference,
        journalEntryId: journal.id,
        allocations: {
          create: [{ billId: bill.id, amount }]
        }
      },
      include: { allocations: true, supplier: true }
    });

    await tx.purchaseBill.update({
      where: { id: bill.id },
      data: { amountPaid: newPaid, status }
    });

    return created;
  });

  return { payment, journal, billStatus: status };
}

export async function getApAging(companyId: string) {
  const bills = await db.purchaseBill.findMany({
    where: {
      companyId,
      status: { in: ["OPEN", "PARTIAL"] }
    },
    include: { supplier: true },
    orderBy: { dueDate: "asc" }
  });

  return bills.map((bill) => {
    const outstanding = round2(Number(bill.total) - Number(bill.amountPaid));
    const days = Math.floor((Date.now() - bill.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      ...bill,
      outstanding,
      daysOverdue: Math.max(0, days),
      bucket:
        days <= 0 ? "current" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+"
    };
  });
}

export async function findDuplicateBills(companyId: string) {
  const bills = await db.purchaseBill.findMany({
    where: { companyId },
    include: { supplier: true },
    orderBy: { billDate: "desc" }
  });

  const groups = new Map<string, typeof bills>();
  for (const bill of bills) {
    const key = `${bill.supplierId}|${Number(bill.total).toFixed(2)}|${bill.billDate.toISOString().slice(0, 10)}`;
    const list = groups.get(key) ?? [];
    list.push(bill);
    groups.set(key, list);
  }

  return Array.from(groups.values())
    .filter((group) => group.length > 1)
    .map((group) => ({
      supplier: group[0].supplier.name,
      total: Number(group[0].total),
      date: group[0].billDate,
      bills: group
    }));
}
