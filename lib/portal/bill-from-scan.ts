import { db } from "@/lib/db";
import { createPurchaseBill } from "@/lib/ap/service";
import { createSalesInvoice } from "@/lib/ar/service";
import { round2 } from "@/lib/accounting/helpers";
import { writeAuditEvent } from "@/lib/audit/log";
import type { ExtractedBill } from "@/lib/ai/extraction";
import type { DocumentCategory } from "@prisma/client";

export type ScanBillForm = {
  merchantName: string;
  documentNumber?: string;
  billDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  description?: string;
};

async function findOrCreateSupplier(companyId: string, name: string) {
  const trimmed = name.trim();
  const existing = await db.supplier.findFirst({
    where: { companyId, name: { equals: trimmed, mode: "insensitive" } }
  });
  if (existing) return existing;

  return db.supplier.create({
    data: { companyId, name: trimmed, paymentTerms: 30 }
  });
}

async function findOrCreateCustomer(companyId: string, name: string) {
  const trimmed = name.trim();
  const existing = await db.customer.findFirst({
    where: { companyId, name: { equals: trimmed, mode: "insensitive" } }
  });
  if (existing) return existing;

  return db.customer.create({
    data: { companyId, name: trimmed, paymentTerms: 30 }
  });
}

export function extractedToForm(extracted: ExtractedBill, category: DocumentCategory): ScanBillForm {
  const total = round2(extracted.total ?? 0);
  const tax = round2(extracted.tax ?? 0);
  const subtotal = round2(extracted.subtotal ?? (total > 0 ? total - tax : 0));
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const merchantName =
    category === "SALES"
      ? extracted.customer ?? extracted.merchant ?? "Customer"
      : extracted.supplier ?? extracted.merchant ?? "Supplier";

  return {
    merchantName,
    documentNumber: extracted.documentNumber,
    billDate: extracted.date ?? today,
    dueDate: extracted.dueDate ?? due,
    subtotal: subtotal > 0 ? subtotal : total,
    taxAmount: tax,
    description: extracted.notes ?? extracted.lineItems?.map((l) => l.description).filter(Boolean).join("; ")
  };
}

export async function postScannedBillToAccounting(input: {
  companyId: string;
  documentId: string;
  category: DocumentCategory;
  form: ScanBillForm;
  actorUserId: string;
}) {
  const doc = await db.sourceDocument.findFirst({
    where: { id: input.documentId, companyId: input.companyId }
  });
  if (!doc) throw new Error("Document not found.");

  const subtotal = round2(input.form.subtotal);
  const taxAmount = round2(input.form.taxAmount);

  if (input.category === "SALES") {
    const customer = await findOrCreateCustomer(input.companyId, input.form.merchantName);
    const { invoice, journal } = await createSalesInvoice({
      companyId: input.companyId,
      customerId: customer.id,
      invoiceDate: input.form.billDate,
      dueDate: input.form.dueDate,
      description: input.form.description ?? `Scanned invoice ${doc.fileName ?? ""}`.trim(),
      subtotal,
      taxAmount,
      invoiceNumber: input.form.documentNumber
    });

    await db.sourceDocument.update({
      where: { id: doc.id },
      data: {
        status: "POSTED",
        documentDate: new Date(input.form.billDate),
        extractedJson: {
          ...(doc.extractedJson as object),
          postedAs: "SalesInvoice",
          invoiceId: invoice.id,
          form: input.form
        }
      }
    });

    await writeAuditEvent({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      entityType: "SourceDocument",
      entityId: doc.id,
      action: "SCAN_POST_SALES",
      afterJson: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, journalId: journal.id }
    });

    return { type: "sales" as const, invoice, journal };
  }

  const supplier = await findOrCreateSupplier(input.companyId, input.form.merchantName);
  const { bill, journal } = await createPurchaseBill({
    companyId: input.companyId,
    supplierId: supplier.id,
    billDate: input.form.billDate,
    dueDate: input.form.dueDate,
    description: input.form.description ?? `Scanned bill ${doc.fileName ?? ""}`.trim(),
    subtotal,
    taxAmount,
    billNumber: input.form.documentNumber
  });

  await db.sourceDocument.update({
    where: { id: doc.id },
    data: {
      status: "POSTED",
      documentDate: new Date(input.form.billDate),
      extractedJson: {
        ...(doc.extractedJson as object),
        postedAs: "PurchaseBill",
        billId: bill.id,
        form: input.form
      }
    }
  });

  await writeAuditEvent({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    entityType: "SourceDocument",
    entityId: doc.id,
    action: "SCAN_POST_PURCHASE",
    afterJson: { billId: bill.id, billNumber: bill.billNumber, journalId: journal.id }
  });

  return { type: "purchase" as const, bill, journal };
}
