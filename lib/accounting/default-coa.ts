import type { AccountType } from "@prisma/client";

export type CoaTemplate = {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
};

export const DEFAULT_MALAYSIA_COA: CoaTemplate[] = [
  { code: "1000", name: "Assets", type: "ASSET" },
  { code: "1100", name: "Cash", type: "ASSET", parentCode: "1000" },
  { code: "1200", name: "Bank", type: "ASSET", parentCode: "1000" },
  { code: "1300", name: "Accounts Receivable", type: "ASSET", parentCode: "1000" },
  { code: "1400", name: "Inventory", type: "ASSET", parentCode: "1000" },
  { code: "1500", name: "Prepayments", type: "ASSET", parentCode: "1000" },
  { code: "1600", name: "Fixed Assets", type: "ASSET", parentCode: "1000" },
  { code: "1700", name: "Deposits", type: "ASSET", parentCode: "1000" },
  { code: "1800", name: "Other Assets", type: "ASSET", parentCode: "1000" },
  { code: "2000", name: "Liabilities", type: "LIABILITY" },
  { code: "2100", name: "Accounts Payable", type: "LIABILITY", parentCode: "2000" },
  { code: "2200", name: "Accrued Expenses", type: "LIABILITY", parentCode: "2000" },
  { code: "2300", name: "Loans", type: "LIABILITY", parentCode: "2000" },
  { code: "2400", name: "SST Payable", type: "LIABILITY", parentCode: "2000" },
  { code: "2500", name: "Tax Payable", type: "LIABILITY", parentCode: "2000" },
  { code: "2600", name: "Payroll Liabilities", type: "LIABILITY", parentCode: "2000" },
  { code: "3000", name: "Equity", type: "EQUITY" },
  { code: "3100", name: "Share Capital", type: "EQUITY", parentCode: "3000" },
  { code: "3200", name: "Retained Earnings", type: "EQUITY", parentCode: "3000" },
  { code: "3300", name: "Owner Drawings", type: "EQUITY", parentCode: "3000" },
  { code: "3400", name: "Reserves", type: "EQUITY", parentCode: "3000" },
  { code: "4000", name: "Revenue", type: "REVENUE" },
  { code: "4100", name: "Product Sales", type: "REVENUE", parentCode: "4000" },
  { code: "4200", name: "Service Revenue", type: "REVENUE", parentCode: "4000" },
  { code: "4300", name: "Other Income", type: "REVENUE", parentCode: "4000" },
  { code: "5000", name: "Expenses", type: "EXPENSE" },
  { code: "5100", name: "Salaries", type: "EXPENSE", parentCode: "5000" },
  { code: "5200", name: "Rent", type: "EXPENSE", parentCode: "5000" },
  { code: "5300", name: "Utilities", type: "EXPENSE", parentCode: "5000" },
  { code: "5400", name: "Marketing", type: "EXPENSE", parentCode: "5000" },
  { code: "5500", name: "Transportation", type: "EXPENSE", parentCode: "5000" },
  { code: "5600", name: "Office Expenses", type: "EXPENSE", parentCode: "5000" },
  { code: "5700", name: "Cost of Goods Sold", type: "EXPENSE", parentCode: "5000" },
  { code: "5800", name: "Professional Fees", type: "EXPENSE", parentCode: "5000" },
  { code: "5900", name: "Depreciation", type: "EXPENSE", parentCode: "5000" },
  { code: "5950", name: "Input Tax", type: "EXPENSE", parentCode: "5000" }
];
