/** Human-readable labels for demo UX (never show raw enums to users). */

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    NOT_STARTED: "Not started",
    UPLOADED: "Received",
    NEEDS_FIX: "Needs your action",
    ACCEPTED: "Accepted",
    SKIPPED: "Skipped",
    AI_PROCESSED: "AI processed",
    NEEDS_CLIENT: "Waiting on client",
    IN_REVIEW: "In review",
    APPROVED: "Approved",
    POSTED: "Posted",
    REJECTED: "Rejected",
    OPEN: "Open",
    PARTIAL: "Partially paid",
    PAID: "Paid",
    DRAFT: "Draft",
    PENDING: "Pending",
    COMPLETED: "Done",
    PROPOSED: "Proposed"
  };
  return map[status] ?? status.replace(/_/g, " ").toLowerCase();
}

export function categoryLabel(category: string): string {
  const map: Record<string, string> = {
    BANK: "Bank",
    SALES: "Sales",
    PURCHASE: "Purchases",
    PAYROLL: "Payroll",
    TAX: "Tax",
    OTHER: "Other"
  };
  return map[category] ?? category;
}

export function portalLabel(portal: string): string {
  const map: Record<string, string> = {
    client: "Client",
    accountant: "Accountant",
    tax: "Tax",
    audit: "Audit",
    manager: "Manager",
    boss: "Boss / Partner"
  };
  return map[portal] ?? portal;
}

export function formatPeriod(start?: string | Date | null, end?: string | Date | null): string {
  if (!start) return "Current period";
  const d = typeof start === "string" ? new Date(start) : start;
  return d.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
}
