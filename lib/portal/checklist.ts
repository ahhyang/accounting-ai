import type { DocumentCategory } from "@prisma/client";

export type ChecklistTemplate = {
  key: string;
  title: string;
  instructions: string;
  whyItMatters: string;
  category: DocumentCategory;
  sortOrder: number;
};

export const MONTHLY_CHECKLIST: ChecklistTemplate[] = [
  {
    key: "bank_statements",
    title: "Upload bank statements",
    instructions:
      "Upload PDF or CSV statements for every business bank account this month. Include all pages.",
    whyItMatters: "Lets your accountant reconcile cash and catch missing transactions.",
    category: "BANK",
    sortOrder: 1
  },
  {
    key: "sales_docs",
    title: "Upload sales invoices / receipts",
    instructions:
      "Upload customer invoices, receipts, or POS summaries for money you received or billed.",
    whyItMatters: "Records your revenue and accounts receivable correctly.",
    category: "SALES",
    sortOrder: 2
  },
  {
    key: "purchase_docs",
    title: "Upload purchase bills / supplier invoices",
    instructions:
      "Upload supplier bills, Grab receipts, office expenses, and any purchase invoices.",
    whyItMatters: "Captures expenses and accounts payable for accurate profit.",
    category: "PURCHASE",
    sortOrder: 3
  },
  {
    key: "payroll_summary",
    title: "Upload payroll summary (if any)",
    instructions:
      "If you paid salaries this month, upload payroll summary or payslip pack. Skip if not applicable.",
    whyItMatters: "Posts salary and statutory costs into the books.",
    category: "PAYROLL",
    sortOrder: 4
  },
  {
    key: "tax_docs",
    title: "Upload SST / tax documents (if any)",
    instructions: "Upload SST returns, tax notices, or related tax documents if you have them.",
    whyItMatters: "Keeps tax filings aligned with your accounting records.",
    category: "TAX",
    sortOrder: 5
  },
  {
    key: "month_questions",
    title: "Answer short month questions",
    instructions:
      "Tell us: (1) any cash sales not invoiced? (2) owner drawings? (3) new loans or capital injected?",
    whyItMatters: "Prevents missing adjustments that only the business owner knows.",
    category: "OTHER",
    sortOrder: 6
  }
];

export function categoryToSourceType(category: DocumentCategory) {
  switch (category) {
    case "BANK":
      return "BANK_STATEMENT" as const;
    case "SALES":
      return "SALES_INVOICE" as const;
    case "PURCHASE":
      return "PURCHASE_BILL" as const;
    case "PAYROLL":
      return "PAYROLL" as const;
    case "TAX":
      return "TAX" as const;
    default:
      return "OTHER" as const;
  }
}

export function clientStatusLabel(status: string): string {
  switch (status) {
    case "NOT_STARTED":
      return "Not started";
    case "UPLOADED":
      return "Received";
    case "NEEDS_FIX":
      return "Needs your action";
    case "ACCEPTED":
      return "Accepted by accountant";
    case "SKIPPED":
      return "Skipped";
    case "UPLOADED_DOC":
    case "UPLOADED":
      return "Received";
    case "AI_PROCESSED":
      return "Processing";
    case "NEEDS_CLIENT":
      return "Needs your action";
    case "IN_REVIEW":
      return "With accountant";
    case "APPROVED":
    case "POSTED":
      return "Booked";
    case "REJECTED":
      return "Needs your action";
    default:
      return status;
  }
}
