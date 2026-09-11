/**
 * Bulk demo data — multiple SME client companies so the Boss/Manager dashboards
 * look like a real practice when demonstrating.
 *
 * Run: npm run db:seed:bulk
 * Re-runnable: companies that already exist (by name) are skipped.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { createCompanyWithDefaults } from "../lib/company/setup";
import { createSalesInvoice, createArReceipt } from "../lib/ar/service";
import { createPurchaseBill, createApPayment } from "../lib/ap/service";
import { importBankTransactions, autoMatchBankTransactions } from "../lib/banking/reconciliation";
import { closeAccountingPeriod } from "../lib/accounting/period-close";

const db = new PrismaClient();
const PASSWORD = "demo1234";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

type InvoiceSpec = { subtotal: number; tax: number; paid?: boolean; daysOld?: number };
type BillSpec = { subtotal: number; tax: number; paid?: boolean; daysOld?: number; duplicate?: boolean };

type ClientSpec = {
  name: string;
  registrationNumber: string;
  industry: string;
  ownerEmail: string;
  ownerName: string;
  billingStatus: "NOT_BILLED" | "INVOICED" | "PAID" | "OVERDUE";
  engagementStatus: "ONBOARDING" | "ACTIVE" | "ON_HOLD" | "COMPLETED";
  fee: number;
  sstRegistered: boolean;
  sstNumber?: string;
  invoices: InvoiceSpec[];
  bills: BillSpec[];
  documents: Array<{ category: string; status: string; confidence: number }>;
  monthEndDone: number; // number of checklist tasks marked complete (0-12)
  closePeriod?: boolean;
};

const CLIENTS: ClientSpec[] = [
  {
    name: "Alpha Trading Sdn Bhd",
    registrationNumber: "202101001234",
    industry: "Retail",
    ownerEmail: "alpha@demo.my",
    ownerName: "Alpha Owner",
    billingStatus: "PAID",
    engagementStatus: "ACTIVE",
    fee: 1500,
    sstRegistered: true,
    sstNumber: "W10-1000-00000001",
    invoices: [
      { subtotal: 18000, tax: 1080, paid: true, daysOld: 20 },
      { subtotal: 12500, tax: 750, paid: true, daysOld: 12 },
      { subtotal: 9800, tax: 588, daysOld: 3 }
    ],
    bills: [
      { subtotal: 6000, tax: 360, paid: true, daysOld: 18 },
      { subtotal: 3200, tax: 192, paid: true, daysOld: 9 },
      { subtotal: 2100, tax: 126, daysOld: 2 }
    ],
    documents: [
      { category: "BANK", status: "POSTED", confidence: 95 },
      { category: "SALES", status: "POSTED", confidence: 96 },
      { category: "PURCHASE", status: "POSTED", confidence: 94 },
      { category: "TAX", status: "POSTED", confidence: 90 }
    ],
    monthEndDone: 12,
    closePeriod: true
  },
  {
    name: "Beta Retail Sdn Bhd",
    registrationNumber: "202202002345",
    industry: "Retail",
    ownerEmail: "beta@demo.my",
    ownerName: "Beta Owner",
    billingStatus: "INVOICED",
    engagementStatus: "ACTIVE",
    fee: 1800,
    sstRegistered: true,
    sstNumber: "W10-1000-00000002",
    invoices: [
      { subtotal: 22000, tax: 1320, paid: true, daysOld: 25 },
      { subtotal: 15400, tax: 924, daysOld: 6 }
    ],
    bills: [
      { subtotal: 7000, tax: 420, daysOld: 15 },
      { subtotal: 7000, tax: 420, daysOld: 15, duplicate: true },
      { subtotal: 4300, tax: 258, daysOld: 4 }
    ],
    documents: [
      { category: "BANK", status: "POSTED", confidence: 93 },
      { category: "PURCHASE", status: "IN_REVIEW", confidence: 62 },
      { category: "PURCHASE", status: "IN_REVIEW", confidence: 58 },
      { category: "SALES", status: "POSTED", confidence: 91 }
    ],
    monthEndDone: 8
  },
  {
    name: "Gamma Services Sdn Bhd",
    registrationNumber: "202003003456",
    industry: "Professional Services",
    ownerEmail: "gamma@demo.my",
    ownerName: "Gamma Owner",
    billingStatus: "OVERDUE",
    engagementStatus: "ACTIVE",
    fee: 2200,
    sstRegistered: false,
    invoices: [{ subtotal: 6000, tax: 0, daysOld: 8 }],
    bills: [
      { subtotal: 9000, tax: 0, paid: true, daysOld: 20 },
      { subtotal: 6500, tax: 0, daysOld: 5 }
    ],
    documents: [
      { category: "BANK", status: "POSTED", confidence: 90 },
      { category: "PURCHASE", status: "NEEDS_CLIENT", confidence: 40 },
      { category: "PAYROLL", status: "IN_REVIEW", confidence: 66 }
    ],
    monthEndDone: 5
  },
  {
    name: "Delta Manufacturing Sdn Bhd",
    registrationNumber: "201904004567",
    industry: "Manufacturing",
    ownerEmail: "delta@demo.my",
    ownerName: "Delta Owner",
    billingStatus: "INVOICED",
    engagementStatus: "ONBOARDING",
    fee: 3200,
    sstRegistered: true,
    sstNumber: "W10-1000-00000004",
    invoices: [{ subtotal: 42000, tax: 2520, daysOld: 10 }],
    bills: [
      { subtotal: 15000, tax: 900, daysOld: 12 },
      { subtotal: 8000, tax: 480, daysOld: 7 }
    ],
    documents: [
      { category: "BANK", status: "UPLOADED", confidence: 0 },
      { category: "PURCHASE", status: "UPLOADED", confidence: 0 },
      { category: "PURCHASE", status: "UPLOADED", confidence: 0 },
      { category: "SALES", status: "UPLOADED", confidence: 0 },
      { category: "PAYROLL", status: "UPLOADED", confidence: 0 },
      { category: "OTHER", status: "UPLOADED", confidence: 0 }
    ],
    monthEndDone: 2
  },
  {
    name: "Epsilon Logistics Sdn Bhd",
    registrationNumber: "202205005678",
    industry: "Logistics",
    ownerEmail: "epsilon@demo.my",
    ownerName: "Epsilon Owner",
    billingStatus: "NOT_BILLED",
    engagementStatus: "ACTIVE",
    fee: 1600,
    sstRegistered: true,
    sstNumber: "W10-1000-00000005",
    invoices: [
      { subtotal: 26000, tax: 1560, paid: true, daysOld: 22 },
      { subtotal: 18300, tax: 1098, daysOld: 4 }
    ],
    bills: [
      { subtotal: 9500, tax: 570, paid: true, daysOld: 14 },
      { subtotal: 5200, tax: 312, daysOld: 3 }
    ],
    documents: [
      { category: "BANK", status: "POSTED", confidence: 94 },
      { category: "SALES", status: "POSTED", confidence: 92 },
      { category: "PURCHASE", status: "IN_REVIEW", confidence: 68 }
    ],
    monthEndDone: 10
  },
  {
    name: "Zeta Foods Sdn Bhd",
    registrationNumber: "202106006789",
    industry: "Food & Beverage",
    ownerEmail: "zeta@demo.my",
    ownerName: "Zeta Owner",
    billingStatus: "PAID",
    engagementStatus: "ACTIVE",
    fee: 1400,
    sstRegistered: true,
    sstNumber: "W10-1000-00000006",
    invoices: [
      { subtotal: 14000, tax: 840, daysOld: 45 },
      { subtotal: 11200, tax: 672, daysOld: 40 },
      { subtotal: 9600, tax: 576, daysOld: 5 }
    ],
    bills: [
      { subtotal: 5000, tax: 300, daysOld: 16 },
      { subtotal: 3800, tax: 228, daysOld: 11 },
      { subtotal: 3800, tax: 228, daysOld: 11, duplicate: true }
    ],
    documents: [
      { category: "BANK", status: "POSTED", confidence: 92 },
      { category: "PURCHASE", status: "POSTED", confidence: 89 },
      { category: "SALES", status: "IN_REVIEW", confidence: 64 },
      { category: "PAYROLL", status: "POSTED", confidence: 90 }
    ],
    monthEndDone: 9
  },
  {
    name: "Eta Construction Sdn Bhd",
    registrationNumber: "201807007890",
    industry: "Construction",
    ownerEmail: "eta@demo.my",
    ownerName: "Eta Owner",
    billingStatus: "OVERDUE",
    engagementStatus: "ON_HOLD",
    fee: 4500,
    sstRegistered: false,
    invoices: [{ subtotal: 30000, tax: 0, daysOld: 35 }],
    bills: [
      { subtotal: 28000, tax: 0, paid: true, daysOld: 30 },
      { subtotal: 19000, tax: 0, daysOld: 8 }
    ],
    documents: [
      { category: "BANK", status: "POSTED", confidence: 88 },
      { category: "PURCHASE", status: "NEEDS_CLIENT", confidence: 35 },
      { category: "PURCHASE", status: "NEEDS_CLIENT", confidence: 38 }
    ],
    monthEndDone: 3
  },
  {
    name: "Theta Tech Sdn Bhd",
    registrationNumber: "202309008901",
    industry: "Technology",
    ownerEmail: "theta@demo.my",
    ownerName: "Theta Owner",
    billingStatus: "INVOICED",
    engagementStatus: "ACTIVE",
    fee: 2600,
    sstRegistered: true,
    sstNumber: "W10-1000-00000008",
    invoices: [
      { subtotal: 36000, tax: 2160, paid: true, daysOld: 18 },
      { subtotal: 24500, tax: 1470, daysOld: 2 }
    ],
    bills: [
      { subtotal: 12000, tax: 720, paid: true, daysOld: 13 },
      { subtotal: 6800, tax: 408, daysOld: 6 }
    ],
    documents: [
      { category: "BANK", status: "POSTED", confidence: 95 },
      { category: "SALES", status: "POSTED", confidence: 93 },
      { category: "PURCHASE", status: "POSTED", confidence: 91 },
      { category: "TAX", status: "IN_REVIEW", confidence: 60 }
    ],
    monthEndDone: 11
  }
];

async function seedClient(spec: ClientSpec) {
  const existing = await db.company.findFirst({ where: { name: spec.name } });
  if (existing) {
    console.log(`skip (exists): ${spec.name}`);
    return;
  }

  const { company, user } = await createCompanyWithDefaults({
    name: spec.name,
    registrationNumber: spec.registrationNumber,
    businessType: "Sdn Bhd",
    industry: spec.industry,
    ownerEmail: spec.ownerEmail,
    ownerName: spec.ownerName
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  const period = await db.accountingPeriod.findFirst({
    where: { companyId: company.id },
    orderBy: { startDate: "desc" }
  });
  if (!period) throw new Error(`No period for ${spec.name}`);

  await db.taxSettings.update({
    where: { companyId: company.id },
    data: {
      sstRegistered: spec.sstRegistered,
      sstNumber: spec.sstNumber ?? null,
      defaultTaxCode: spec.sstRegistered ? "SST-6%" : null
    }
  });

  // Customers + suppliers
  const customer = await db.customer.create({
    data: { companyId: company.id, name: `${spec.industry} Customer A`, email: "ap@customer.my" }
  });
  const customer2 = await db.customer.create({
    data: { companyId: company.id, name: `${spec.industry} Customer B` }
  });
  const supplier = await db.supplier.create({
    data: { companyId: company.id, name: `${spec.industry} Supplier A` }
  });

  // Sales invoices + receipts
  for (const inv of spec.invoices) {
    const created = await createSalesInvoice({
      companyId: company.id,
      customerId: customer.id,
      invoiceDate: daysAgo(inv.daysOld ?? 10),
      dueDate: daysAgo((inv.daysOld ?? 10) - 30),
      description: `${spec.industry} sale`,
      subtotal: inv.subtotal,
      taxAmount: inv.tax
    });
    if (inv.paid) {
      await createArReceipt({
        companyId: company.id,
        customerId: customer.id,
        invoiceId: created.invoice.id,
        receiptDate: daysAgo(Math.max(0, (inv.daysOld ?? 10) - 5)),
        amount: Number(created.invoice.total),
        reference: `RCT-${created.invoice.invoiceNumber}`
      });
    }
  }
  // Extra customer record to make dashboards non-trivial
  await db.customer.update({ where: { id: customer2.id }, data: { paymentTerms: 45 } });

  // Purchase bills + payments (+ duplicates)
  for (const b of spec.bills) {
    const created = await createPurchaseBill({
      companyId: company.id,
      supplierId: supplier.id,
      billDate: daysAgo(b.daysOld ?? 8),
      dueDate: daysAgo((b.daysOld ?? 8) - 30),
      description: b.duplicate ? "Duplicate purchase (possible)" : `${spec.industry} purchase`,
      subtotal: b.subtotal,
      taxAmount: b.tax,
      billNumber: b.duplicate ? `BILL-DUP-${company.id.slice(-4)}` : undefined
    });
    if (b.paid) {
      await createApPayment({
        companyId: company.id,
        supplierId: supplier.id,
        billId: created.bill.id,
        paymentDate: daysAgo(Math.max(0, (b.daysOld ?? 8) - 4)),
        amount: Number(created.bill.total),
        reference: `PAY-${created.bill.billNumber}`
      });
    }
  }

  // Bank account + transactions
  const bank = await db.bankAccount.create({
    data: {
      companyId: company.id,
      name: "Main Current Account",
      bankName: "Maybank",
      accountNumber: `5141${String(Math.floor(Math.random() * 900000) + 100000)}`,
      currency: "MYR"
    }
  });
  await importBankTransactions(bank.id, [
    { txnDate: daysAgo(12), amount: 15000, description: "FPX DEPOSIT", reference: "FPX-001" },
    { txnDate: daysAgo(6), amount: -4200, description: "IBG SUPPLIER", reference: "IBG-002" },
    { txnDate: daysAgo(2), amount: -180, description: "BANK FEE", reference: "FEE-003" },
    ...(spec.documents.some((d) => d.status !== "POSTED")
      ? [{ txnDate: daysAgo(1), amount: 999, description: "UNKNOWN CREDIT", reference: "UNK-004" }]
      : [])
  ]);
  await autoMatchBankTransactions(company.id, bank.id);

  // Source documents across the AI pipeline
  let idx = 0;
  for (const doc of spec.documents) {
    idx += 1;
    await db.sourceDocument.create({
      data: {
        companyId: company.id,
        periodId: period.id,
        type: "OTHER",
        category: doc.category as never,
        status: doc.status as never,
        fileName: `${spec.name.split(" ")[0]}-doc-${idx}.pdf`,
        mimeType: "application/pdf",
        aiConfidence: doc.confidence || null,
        uploadedByUserId: user.id,
        documentDate: new Date(daysAgo(idx * 2)),
        clientNote: doc.status === "NEEDS_CLIENT" ? "Please re-upload a clearer copy." : null,
        extractedJson:
          doc.confidence > 0
            ? { extracted: { merchant: `${spec.industry} Vendor`, total: 100 * idx }, confidence: doc.confidence }
            : undefined
      }
    });
  }

  // Month-end checklist progress
  const run = await db.monthEndRun.findFirst({
    where: { companyId: company.id, periodId: period.id },
    include: { tasks: { orderBy: { sortOrder: "asc" } } }
  });
  if (run) {
    const doneIds = run.tasks.slice(0, spec.monthEndDone).map((t) => t.id);
    if (doneIds.length) {
      await db.monthEndTask.updateMany({
        where: { id: { in: doneIds } },
        data: { status: "COMPLETED", completedAt: new Date(), completedBy: user.id }
      });
    }
  }

  // Firm engagement / billing
  await db.clientEngagement.upsert({
    where: { companyId: company.id },
    update: {
      engagementStatus: spec.engagementStatus,
      billingStatus: spec.billingStatus,
      accountingFee: spec.fee,
      amountDue: spec.billingStatus === "PAID" ? 0 : spec.fee,
      dueDate: new Date(new Date().getFullYear(), new Date().getMonth(), 28),
      invoiceNumber: `INV-FIRM-${company.id.slice(-4).toUpperCase()}`,
      lastPaymentDate: spec.billingStatus === "PAID" ? new Date(daysAgo(10)) : null,
      notes: `Monthly package — ${spec.industry}`
    },
    create: {
      companyId: company.id,
      engagementStatus: spec.engagementStatus,
      billingStatus: spec.billingStatus,
      accountingFee: spec.fee,
      amountDue: spec.billingStatus === "PAID" ? 0 : spec.fee,
      dueDate: new Date(new Date().getFullYear(), new Date().getMonth(), 28),
      invoiceNumber: `INV-FIRM-${company.id.slice(-4).toUpperCase()}`,
      lastPaymentDate: spec.billingStatus === "PAID" ? new Date(daysAgo(10)) : null,
      notes: `Monthly package — ${spec.industry}`
    }
  });

  // Optionally close the period (requires checklist 100% + balanced TB)
  if (spec.closePeriod) {
    try {
      await closeAccountingPeriod({
        companyId: company.id,
        periodId: period.id,
        actorUserId: user.id
      });
    } catch (e) {
      console.log(`  (period not closed for ${spec.name}: ${(e as Error).message})`);
    }
  }

  console.log(`created: ${spec.name} (${spec.ownerEmail} / ${PASSWORD})`);
}

async function main() {
  for (const spec of CLIENTS) {
    await seedClient(spec);
  }
  const count = await db.company.count();
  console.log(`\nBulk demo ready. Total companies: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
