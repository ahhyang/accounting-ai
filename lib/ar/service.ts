import { db } from "@/lib/db";
import { createAndPostJournal, PostingError } from "@/lib/accounting/posting";
import { getAccountByCode, nextDocNumber, round2 } from "@/lib/accounting/helpers";

export type CreateInvoiceInput = {
  companyId: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  description?: string;
  subtotal: number;
  taxAmount?: number;
  invoiceNumber?: string;
};

export async function createSalesInvoice(input: CreateInvoiceInput) {
  const tax = round2(input.taxAmount ?? 0);
  const subtotal = round2(input.subtotal);
  const total = round2(subtotal + tax);

  if (total <= 0) throw new PostingError("Invoice total must be positive.");

  const ar = await getAccountByCode(input.companyId, "1300");
  const sales = await getAccountByCode(input.companyId, "4100");
  const sst = tax > 0 ? await getAccountByCode(input.companyId, "2400") : null;

  const invoiceNumber =
    input.invoiceNumber ?? (await nextDocNumber(input.companyId, "INV", "invoice"));
  const journalNumber = await nextDocNumber(input.companyId, "JE", "journal");

  const lines = [
    { accountId: ar.id, debit: total, memo: `Invoice ${invoiceNumber}` },
    { accountId: sales.id, credit: subtotal, memo: "Sales revenue" }
  ];

  if (tax > 0 && sst) {
    lines.push({ accountId: sst.id, credit: tax, memo: "SST output" });
  }

  const journal = await createAndPostJournal({
    companyId: input.companyId,
    journalDate: input.invoiceDate,
    journalNumber,
    description: input.description ?? `Sales invoice ${invoiceNumber}`,
    lines
  });

  const invoice = await db.salesInvoice.create({
    data: {
      companyId: input.companyId,
      customerId: input.customerId,
      invoiceNumber,
      invoiceDate: new Date(input.invoiceDate),
      dueDate: new Date(input.dueDate),
      description: input.description,
      subtotal,
      taxAmount: tax,
      total,
      status: "OPEN",
      journalEntryId: journal.id
    },
    include: { customer: true }
  });

  return { invoice, journal };
}

export type CreateReceiptInput = {
  companyId: string;
  customerId: string;
  receiptDate: string;
  amount: number;
  invoiceId: string;
  reference?: string;
};

export async function createArReceipt(input: CreateReceiptInput) {
  const amount = round2(input.amount);
  if (amount <= 0) throw new PostingError("Receipt amount must be positive.");

  const invoice = await db.salesInvoice.findFirst({
    where: { id: input.invoiceId, companyId: input.companyId, customerId: input.customerId }
  });

  if (!invoice) throw new PostingError("Invoice not found.");

  const outstanding = round2(Number(invoice.total) - Number(invoice.amountPaid));
  if (amount > outstanding) {
    throw new PostingError(`Allocation exceeds outstanding balance of ${outstanding.toFixed(2)}.`);
  }

  const bank = await getAccountByCode(input.companyId, "1200");
  const ar = await getAccountByCode(input.companyId, "1300");
  const receiptNumber = await nextDocNumber(input.companyId, "RCT", "receipt");
  const journalNumber = await nextDocNumber(input.companyId, "JE", "journal");

  const journal = await createAndPostJournal({
    companyId: input.companyId,
    journalDate: input.receiptDate,
    journalNumber,
    description: `Receipt ${receiptNumber} for ${invoice.invoiceNumber}`,
    lines: [
      { accountId: bank.id, debit: amount, memo: "Customer payment" },
      { accountId: ar.id, credit: amount, memo: `Clear AR ${invoice.invoiceNumber}` }
    ]
  });

  const newPaid = round2(Number(invoice.amountPaid) + amount);
  const status = newPaid >= Number(invoice.total) ? "PAID" : "PARTIAL";

  const receipt = await db.$transaction(async (tx) => {
    const created = await tx.arReceipt.create({
      data: {
        companyId: input.companyId,
        customerId: input.customerId,
        receiptNumber,
        receiptDate: new Date(input.receiptDate),
        amount,
        reference: input.reference,
        journalEntryId: journal.id,
        allocations: {
          create: [{ invoiceId: invoice.id, amount }]
        }
      },
      include: { allocations: true, customer: true }
    });

    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: { amountPaid: newPaid, status }
    });

    return created;
  });

  return { receipt, journal, invoiceStatus: status };
}

export async function getArAging(companyId: string) {
  const invoices = await db.salesInvoice.findMany({
    where: {
      companyId,
      status: { in: ["OPEN", "PARTIAL"] }
    },
    include: { customer: true },
    orderBy: { dueDate: "asc" }
  });

  return invoices.map((inv) => {
    const outstanding = round2(Number(inv.total) - Number(inv.amountPaid));
    const days = Math.floor((Date.now() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      ...inv,
      outstanding,
      daysOverdue: Math.max(0, days),
      bucket:
        days <= 0 ? "current" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+"
    };
  });
}
