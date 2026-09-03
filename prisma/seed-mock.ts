/**
 * Rich mock data for Demo Company Sdn Bhd — AR/AP, bank, inbox docs, tax, audit.
 * Run: npx tsx prisma/seed-mock.ts
 * Force recreate books: FORCE_MOCK=1 npx tsx prisma/seed-mock.ts
 */
import { PrismaClient } from "@prisma/client";
import { createSalesInvoice, createArReceipt } from "../lib/ar/service";
import { createPurchaseBill, createApPayment } from "../lib/ap/service";
import { importBankTransactions, autoMatchBankTransactions } from "../lib/banking/reconciliation";
import { ensureMonthChecklist } from "../lib/portal/documents";
import { writeAuditEvent } from "../lib/audit/log";
import { buildClientMonthlyReport } from "../lib/portal/reports";

const db = new PrismaClient();
const FORCE = process.env.FORCE_MOCK === "1";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function seedBooks(companyId: string, bankAccountId: string) {
  const existingCustomers = await db.customer.count({ where: { companyId } });
  if (existingCustomers > 0 && !FORCE) {
    console.log("Books mock already present — keeping AR/AP/bank.");
    return { skipped: true as const };
  }

  if (FORCE && existingCustomers > 0) {
    console.log("FORCE_MOCK=1 — clearing prior AR/AP/bank mock...");
    await db.reconciliationMatch.deleteMany({
      where: { bankTransaction: { bankAccount: { companyId } } }
    });
    await db.bankTransaction.deleteMany({
      where: { bankAccount: { companyId } }
    });
    await db.arPaymentAllocation.deleteMany({
      where: { receipt: { companyId } }
    });
    await db.apPaymentAllocation.deleteMany({
      where: { payment: { companyId } }
    });
    await db.arReceipt.deleteMany({ where: { companyId } });
    await db.apPayment.deleteMany({ where: { companyId } });
    await db.salesInvoice.deleteMany({ where: { companyId } });
    await db.purchaseBill.deleteMany({ where: { companyId } });
    await db.customer.deleteMany({ where: { companyId } });
    await db.supplier.deleteMany({ where: { companyId } });
  }

  const [alpha, beta, gamma] = await Promise.all([
    db.customer.create({
      data: {
        companyId,
        name: "Alpha Trading Sdn Bhd",
        email: "ap@alpha.my",
        phone: "03-1234-5678",
        creditLimit: 50000,
        paymentTerms: 30
      }
    }),
    db.customer.create({
      data: {
        companyId,
        name: "Beta Retail KL",
        email: "finance@beta.my",
        paymentTerms: 14
      }
    }),
    db.customer.create({
      data: {
        companyId,
        name: "Gamma Cafe Sabah",
        email: "owner@gamma.my",
        paymentTerms: 7
      }
    })
  ]);

  const [officePlus, cloudHost, digiAds, grabSupplier] = await Promise.all([
    db.supplier.create({
      data: {
        companyId,
        name: "OfficePlus Supplies",
        email: "billing@officeplus.my",
        paymentTerms: 30
      }
    }),
    db.supplier.create({
      data: {
        companyId,
        name: "CloudHost MY",
        email: "invoice@cloudhost.my",
        paymentTerms: 14
      }
    }),
    db.supplier.create({
      data: {
        companyId,
        name: "DigiAds Media",
        email: "accounts@digiads.my",
        paymentTerms: 30
      }
    }),
    db.supplier.create({
      data: {
        companyId,
        name: "Grab Business",
        email: "biz@grab.my",
        paymentTerms: 7
      }
    })
  ]);

  const inv1 = await createSalesInvoice({
    companyId,
    customerId: alpha.id,
    invoiceDate: daysAgo(45),
    dueDate: daysAgo(15),
    description: "Website redesign package",
    subtotal: 8000,
    taxAmount: 480
  });

  const inv2 = await createSalesInvoice({
    companyId,
    customerId: beta.id,
    invoiceDate: daysAgo(20),
    dueDate: daysAgo(6),
    description: "POS system setup",
    subtotal: 3500,
    taxAmount: 210
  });

  const inv3 = await createSalesInvoice({
    companyId,
    customerId: gamma.id,
    invoiceDate: daysAgo(5),
    dueDate: daysFromNow(2),
    description: "Monthly support retainer",
    subtotal: 1200,
    taxAmount: 72
  });

  await createSalesInvoice({
    companyId,
    customerId: alpha.id,
    invoiceDate: daysAgo(2),
    dueDate: daysFromNow(28),
    description: "Extra modules",
    subtotal: 2500,
    taxAmount: 150
  });

  await createArReceipt({
    companyId,
    customerId: alpha.id,
    invoiceId: inv1.invoice.id,
    receiptDate: daysAgo(10),
    amount: 5000,
    reference: "FPX-ALPHA-001"
  });

  await createArReceipt({
    companyId,
    customerId: beta.id,
    invoiceId: inv2.invoice.id,
    receiptDate: daysAgo(3),
    amount: 3710,
    reference: "FPX-BETA-002"
  });

  const bill1 = await createPurchaseBill({
    companyId,
    supplierId: officePlus.id,
    billDate: daysAgo(25),
    dueDate: daysAgo(5),
    description: "Office stationery & toner",
    subtotal: 680,
    taxAmount: 40.8
  });

  const bill2 = await createPurchaseBill({
    companyId,
    supplierId: cloudHost.id,
    billDate: daysAgo(12),
    dueDate: daysFromNow(2),
    description: "Cloud hosting August",
    subtotal: 450,
    taxAmount: 27
  });

  await createPurchaseBill({
    companyId,
    supplierId: digiAds.id,
    billDate: daysAgo(8),
    dueDate: daysFromNow(22),
    description: "Facebook ads campaign",
    subtotal: 2200,
    taxAmount: 132
  });

  await createPurchaseBill({
    companyId,
    supplierId: digiAds.id,
    billDate: daysAgo(8),
    dueDate: daysFromNow(22),
    description: "Facebook ads campaign (possible duplicate)",
    subtotal: 2200,
    taxAmount: 132,
    billNumber: "BILL-DUP-DEMO-001"
  });

  await createPurchaseBill({
    companyId,
    supplierId: grabSupplier.id,
    billDate: daysAgo(3),
    dueDate: daysAgo(3),
    description: "Staff Grab rides",
    subtotal: 86.5,
    taxAmount: 0
  });

  await createApPayment({
    companyId,
    supplierId: officePlus.id,
    billId: bill1.bill.id,
    paymentDate: daysAgo(4),
    amount: 720.8,
    reference: "IBG-OFFICE-01"
  });

  await importBankTransactions(bankAccountId, [
    {
      txnDate: daysAgo(10),
      amount: 5000,
      description: "FPX ALPHA TRADING",
      reference: "FPX-ALPHA-001"
    },
    {
      txnDate: daysAgo(3),
      amount: 3710,
      description: "FPX BETA RETAIL",
      reference: "FPX-BETA-002"
    },
    {
      txnDate: daysAgo(4),
      amount: -720.8,
      description: "IBG OFFICEPLUS",
      reference: "IBG-OFFICE-01"
    },
    {
      txnDate: daysAgo(1),
      amount: -42.5,
      description: "BANK SERVICE FEE",
      reference: "FEE-AUG"
    },
    {
      txnDate: daysAgo(1),
      amount: 1000,
      description: "UNKNOWN DEPOSIT",
      reference: "UNK-001"
    }
  ]);

  const match = await autoMatchBankTransactions(companyId, bankAccountId);
  console.log(`Bank auto-match: ${match.summary}`);
  console.log(`Sample open invoice: ${inv3.invoice.invoiceNumber}`);
  console.log(`Sample open bill: ${bill2.bill.billNumber}`);
  return { skipped: false as const };
}

async function seedPortalDocs(companyId: string, periodId: string, actorUserId: string) {
  const existingDocs = await db.sourceDocument.count({
    where: { companyId, fileName: { startsWith: "MOCK-" } }
  });
  if (existingDocs > 0 && !FORCE) {
    console.log("Inbox mock documents already present.");
    return;
  }

  if (FORCE) {
    await db.aiSuggestion.deleteMany({
      where: { companyId, sourceDocument: { fileName: { startsWith: "MOCK-" } } }
    });
    await db.clientMessage.deleteMany({
      where: { companyId, body: { startsWith: "[MOCK]" } }
    });
    await db.sourceDocument.deleteMany({
      where: { companyId, fileName: { startsWith: "MOCK-" } }
    });
  }

  const ready = await db.sourceDocument.create({
    data: {
      companyId,
      periodId,
      type: "RECEIPT",
      category: "PURCHASE",
      status: "IN_REVIEW",
      fileName: "MOCK-grab-receipt.jpg",
      mimeType: "image/jpeg",
      clientNote: "Grab ride to client meeting",
      aiConfidence: 92,
      uploadedByUserId: actorUserId,
      documentDate: new Date(daysAgo(2)),
      extractedJson: {
        extracted: {
          merchant: "Grab",
          supplier: "Grab Business",
          date: daysAgo(2),
          subtotal: 28.5,
          tax: 0,
          total: 28.5,
          currency: "MYR",
          textQuality: "printed",
          notes: "Mock Grab receipt"
        },
        proposal: {
          description: "Grab transport",
          lines: [
            { accountCode: "5600", debit: 28.5, credit: 0, memo: "Transport" },
            { accountCode: "1200", debit: 0, credit: 28.5, memo: "Bank" }
          ]
        },
        riskFlags: [],
        confidence: 92
      }
    }
  });

  await db.aiSuggestion.create({
    data: {
      companyId,
      sourceDocumentId: ready.id,
      type: "BOOKKEEPING_PROPOSAL",
      status: "PROPOSED",
      confidence: 92,
      payload: {
        extracted: {
          merchant: "Grab",
          total: 28.5,
          date: daysAgo(2)
        },
        proposal: {
          description: "Grab transport",
          lines: [
            { accountCode: "5600", debit: 28.5, credit: 0, memo: "Transport" },
            { accountCode: "1200", debit: 0, credit: 28.5, memo: "Bank" }
          ]
        },
        riskFlags: [],
        confidence: 92
      }
    }
  });

  const manual = await db.sourceDocument.create({
    data: {
      companyId,
      periodId,
      type: "PURCHASE_BILL",
      category: "PURCHASE",
      status: "IN_REVIEW",
      fileName: "MOCK-handwritten-supplier-bill.jpg",
      mimeType: "image/jpeg",
      clientNote: "Handwritten bill from hardware shop — unclear total",
      aiConfidence: 48,
      uploadedByUserId: actorUserId,
      documentDate: new Date(daysAgo(4)),
      extractedJson: {
        extracted: {
          merchant: "Ah Chong Hardware",
          date: daysAgo(4),
          total: 155,
          tax: 0,
          textQuality: "handwritten",
          notes: "Amount uncertain"
        },
        proposal: {
          description: "Hardware supplies",
          lines: [
            { accountCode: "5600", debit: 155, credit: 0, memo: "Supplies" },
            { accountCode: "2100", debit: 0, credit: 155, memo: "AP" }
          ]
        },
        riskFlags: ["Handwriting unclear", "Verify total with client"],
        confidence: 48
      }
    }
  });

  await db.aiSuggestion.create({
    data: {
      companyId,
      sourceDocumentId: manual.id,
      type: "BOOKKEEPING_PROPOSAL",
      status: "PROPOSED",
      confidence: 48,
      payload: {
        extracted: { merchant: "Ah Chong Hardware", total: 155 },
        proposal: {
          description: "Hardware supplies",
          lines: [
            { accountCode: "5600", debit: 155, credit: 0, memo: "Supplies" },
            { accountCode: "2100", debit: 0, credit: 155, memo: "AP" }
          ]
        },
        riskFlags: ["Handwriting unclear", "Verify total with client"],
        confidence: 48
      }
    }
  });

  const waiting = await db.sourceDocument.create({
    data: {
      companyId,
      periodId,
      type: "BANK_STATEMENT",
      category: "BANK",
      status: "NEEDS_CLIENT",
      fileName: "MOCK-maybank-blurry.pdf",
      mimeType: "application/pdf",
      clientNote: "Maybank statement — page 2 blurry",
      aiConfidence: 35,
      uploadedByUserId: actorUserId
    }
  });

  await db.clientMessage.create({
    data: {
      companyId,
      sourceDocumentId: waiting.id,
      senderUserId: actorUserId,
      body: "[MOCK] Please re-upload a clearer Maybank statement (all pages).",
      isFromAccountant: true
    }
  });

  await writeAuditEvent({
    companyId,
    actorUserId,
    entityType: "SourceDocument",
    entityId: ready.id,
    action: "MOCK_SEED_INBOX",
    afterJson: { ready: ready.id, manual: manual.id, waiting: waiting.id }
  });

  console.log("Inbox mocks: ready-to-approve, needs-manual, waiting-on-client.");
}

async function seedMonthEndAndReport(companyId: string, periodId: string) {
  await ensureMonthChecklist(companyId, periodId);

  let run = await db.monthEndRun.findFirst({
    where: { companyId, periodId },
    include: { tasks: true }
  });

  if (!run) {
    const { MONTH_END_TASKS } = await import("../lib/accounting/month-end");
    run = await db.monthEndRun.create({
      data: {
        companyId,
        periodId,
        completionScore: 0,
        tasks: {
          create: MONTH_END_TASKS.map((task) => ({
            key: task.key,
            label: task.label,
            sortOrder: task.sortOrder
          }))
        }
      },
      include: { tasks: true }
    });
  }

  const doneKeys = [
    "bank_reconciled",
    "payroll_posted",
    "depreciation_posted",
    "inventory_reconciled"
  ];
  for (const task of run.tasks.filter((t) => doneKeys.includes(t.key))) {
    if (task.status !== "COMPLETED") {
      await db.monthEndTask.update({
        where: { id: task.id },
        data: { status: "COMPLETED", completedAt: new Date(), completedBy: "Mock Seed" }
      });
    }
  }

  const updated = await db.monthEndTask.findMany({ where: { runId: run.id } });
  const score =
    Math.round(
      (updated.filter((t) => t.status === "COMPLETED" || t.status === "NOT_APPLICABLE").length /
        updated.length) *
        10000
    ) / 100;
  await db.monthEndRun.update({ where: { id: run.id }, data: { completionScore: score } });

  await buildClientMonthlyReport(companyId, periodId);
  console.log(`Month-end checklist ~${score}% complete + client monthly report snapshot.`);
}

async function main() {
  const company = await db.company.findFirst({
    where: { name: "Demo Company Sdn Bhd" },
    include: {
      bankAccounts: true,
      periods: { orderBy: { startDate: "desc" }, take: 1 },
      memberships: { include: { user: true }, take: 10 }
    }
  });

  if (!company) {
    throw new Error("Demo company not found. Run npm run db:seed then npm run db:seed:portal first.");
  }

  const period = company.periods[0];
  if (!period) throw new Error("No accounting period. Run npm run db:seed first.");

  const bankAccount = company.bankAccounts[0];
  if (!bankAccount) throw new Error("No bank account on demo company.");

  const actor =
    company.memberships.find((m) => m.user.email === "accountant@demo.my")?.user ??
    company.memberships[0]?.user;
  if (!actor) {
    throw new Error("No users. Run npm run db:seed:portal first.");
  }

  await db.taxSettings.upsert({
    where: { companyId: company.id },
    update: {
      sstRegistered: true,
      sstNumber: "W10-1234-56789012",
      taxRegistrationNo: "C1234567890",
      defaultTaxCode: "SST-6%"
    },
    create: {
      companyId: company.id,
      sstRegistered: true,
      sstNumber: "W10-1234-56789012",
      taxRegistrationNo: "C1234567890",
      defaultTaxCode: "SST-6%"
    }
  });

  await seedBooks(company.id, bankAccount.id);
  await seedPortalDocs(company.id, period.id, actor.id);
  await seedMonthEndAndReport(company.id, period.id);

  const [customers, invoices, suppliers, bills, docs, journals] = await Promise.all([
    db.customer.count({ where: { companyId: company.id } }),
    db.salesInvoice.count({ where: { companyId: company.id } }),
    db.supplier.count({ where: { companyId: company.id } }),
    db.purchaseBill.count({ where: { companyId: company.id } }),
    db.sourceDocument.count({ where: { companyId: company.id } }),
    db.journalEntry.count({ where: { companyId: company.id, status: "POSTED" } })
  ]);

  console.log("\n=== Mock data ready ===");
  console.log(`Company ID: ${company.id}`);
  console.log(`Customers ${customers} | Invoices ${invoices} | Suppliers ${suppliers} | Bills ${bills}`);
  console.log(`Source docs ${docs} | Posted journals ${journals}`);
  console.log("\nTry these logins (password demo1234):");
  console.log("  accountant@demo.my → Inbox, Sales, Purchases, Banking");
  console.log("  tax@demo.my        → SST tax pack");
  console.log("  audit@demo.my      → Trial balance + exceptions");
  console.log("  manager@demo.my    → Month-end / close period");
  console.log("  boss@demo.my       → Firm oversight");
  console.log("  client@demo.my     → Checklist + reports");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
