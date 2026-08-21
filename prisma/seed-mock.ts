/**
 * Rich mock data for Demo Company Sdn Bhd.
 * Run: npx tsx prisma/seed-mock.ts
 */
import { PrismaClient } from "@prisma/client";
import { createSalesInvoice, createArReceipt } from "../lib/ar/service";
import { createPurchaseBill, createApPayment } from "../lib/ap/service";
import { importBankTransactions, autoMatchBankTransactions } from "../lib/banking/reconciliation";

const db = new PrismaClient();

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

async function main() {
  const company = await db.company.findFirst({
    where: { name: "Demo Company Sdn Bhd" },
    include: { bankAccounts: true, accounts: true }
  });

  if (!company) {
    throw new Error("Demo company not found. Run npm run db:seed first.");
  }

  const existingCustomers = await db.customer.count({ where: { companyId: company.id } });
  if (existingCustomers > 0) {
    console.log("Mock data already exists. Skipping.");
    console.log(`Company ID: ${company.id}`);
    return;
  }

  const companyId = company.id;
  const bankAccount = company.bankAccounts[0];
  if (!bankAccount) throw new Error("No bank account on demo company.");

  // --- Customers ---
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

  // --- Suppliers ---
  const [officePlus, cloudHost, digiAds] = await Promise.all([
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
    })
  ]);

  // --- Sales invoices (post to GL) ---
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

  const inv4 = await createSalesInvoice({
    companyId,
    customerId: alpha.id,
    invoiceDate: daysAgo(2),
    dueDate: daysFromNow(28),
    description: "Extra modules",
    subtotal: 2500,
    taxAmount: 150
  });

  // Partial + full receipts
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

  // --- Purchase bills ---
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

  const bill3 = await createPurchaseBill({
    companyId,
    supplierId: digiAds.id,
    billDate: daysAgo(8),
    dueDate: daysFromNow(22),
    description: "Facebook ads campaign",
    subtotal: 2200,
    taxAmount: 132
  });

  // Duplicate-like bill for AI/AP demo
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

  await createApPayment({
    companyId,
    supplierId: officePlus.id,
    billId: bill1.bill.id,
    paymentDate: daysAgo(4),
    amount: 720.8,
    reference: "IBG-OFFICE-01"
  });

  // --- Bank transactions + auto match ---
  await importBankTransactions(bankAccount.id, [
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

  const match = await autoMatchBankTransactions(companyId, bankAccount.id);

  // Complete a few month-end tasks
  const run = await db.monthEndRun.findFirst({
    where: { companyId },
    include: { tasks: true }
  });

  if (run) {
    const doneKeys = ["bank_reconciled", "payroll_posted", "depreciation_posted"];
    for (const task of run.tasks.filter((t) => doneKeys.includes(t.key))) {
      await db.monthEndTask.update({
        where: { id: task.id },
        data: { status: "COMPLETED", completedAt: new Date(), completedBy: "Yong Demo" }
      });
    }
    const updated = await db.monthEndTask.findMany({ where: { runId: run.id } });
    const score =
      Math.round(
        (updated.filter((t) => t.status === "COMPLETED" || t.status === "NOT_APPLICABLE").length /
          updated.length) *
          10000
      ) / 100;
    await db.monthEndRun.update({ where: { id: run.id }, data: { completionScore: score } });
  }

  const openInvoices = await db.salesInvoice.count({
    where: { companyId, status: { in: ["OPEN", "PARTIAL"] } }
  });
  const openBills = await db.purchaseBill.count({
    where: { companyId, status: { in: ["OPEN", "PARTIAL"] } }
  });

  console.log("Mock data created successfully.");
  console.log(`Company ID: ${companyId}`);
  console.log(`Customers: 3 | Invoices: 4 | Open AR docs: ${openInvoices}`);
  console.log(`Suppliers: 3 | Bills: 4 | Open AP docs: ${openBills}`);
  console.log(`Bank match: ${match.summary}`);
  console.log(`Sample invoice: ${inv3.invoice.invoiceNumber}`);
  console.log(`Sample bill: ${bill2.bill.billNumber}`);
  console.log(`Sample bill (due soon): ${bill2.bill.billNumber}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
