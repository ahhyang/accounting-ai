export const MONTH_END_TASKS = [
  { key: "bank_reconciled", label: "Bank reconciled", sortOrder: 1 },
  { key: "ar_reconciled", label: "AR reconciled", sortOrder: 2 },
  { key: "ap_reconciled", label: "AP reconciled", sortOrder: 3 },
  { key: "inventory_reconciled", label: "Inventory reconciled", sortOrder: 4 },
  { key: "payroll_posted", label: "Payroll posted", sortOrder: 5 },
  { key: "depreciation_posted", label: "Depreciation posted", sortOrder: 6 },
  { key: "accruals_recorded", label: "Accruals recorded", sortOrder: 7 },
  { key: "prepayments_reviewed", label: "Prepayments reviewed", sortOrder: 8 },
  { key: "tax_reviewed", label: "Tax reviewed", sortOrder: 9 },
  { key: "suspense_cleared", label: "Suspense account cleared", sortOrder: 10 },
  { key: "trial_balance_checked", label: "Trial balance checked", sortOrder: 11 },
  { key: "financial_statements_reviewed", label: "Financial statements reviewed", sortOrder: 12 }
] as const;

export function calculateCompletionScore(
  tasks: { status: string }[]
): number {
  if (tasks.length === 0) return 0;

  const completed = tasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "NOT_APPLICABLE"
  ).length;

  return Math.round((completed / tasks.length) * 10000) / 100;
}

export function getRemainingTasks(
  tasks: { key: string; label: string; status: string }[]
) {
  return tasks.filter((t) => t.status === "PENDING");
}
