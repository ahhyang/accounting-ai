import type { PermissionAction } from "@prisma/client";

export const SYSTEM_ROLES = {
  OWNER: "Owner",
  ADMIN: "Admin",
  ACCOUNTANT: "Accountant",
  BOOKKEEPER: "Bookkeeper",
  FINANCE_MANAGER: "Finance Manager",
  AUDITOR: "Auditor",
  TAX_AGENT: "Tax Agent",
  CLIENT_OWNER: "Client Owner",
  CLIENT_STAFF: "Client Staff"
} as const;

/** Product portals — mirrors how a Malaysian SME accounting firm is organised */
export type AppPortal = "client" | "accountant" | "tax" | "audit" | "manager" | "boss";

export const CLIENT_ROLES = [SYSTEM_ROLES.CLIENT_OWNER, SYSTEM_ROLES.CLIENT_STAFF] as const;

export const ACCOUNTANT_ROLES = [
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.BOOKKEEPER
] as const;

export const ALL_PERMISSIONS: PermissionAction[] = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "APPROVE",
  "EXPORT",
  "POST",
  "REVERSE",
  "CLOSE_PERIOD",
  "MANAGE_USERS",
  "VIEW_PAYROLL",
  "VIEW_TAX",
  "VIEW_AUDIT"
];

export const ROLE_PERMISSION_MAP: Record<string, PermissionAction[]> = {
  [SYSTEM_ROLES.OWNER]: ALL_PERMISSIONS,
  [SYSTEM_ROLES.ADMIN]: ALL_PERMISSIONS,
  [SYSTEM_ROLES.ACCOUNTANT]: [
    "VIEW",
    "CREATE",
    "EDIT",
    "APPROVE",
    "EXPORT",
    "POST",
    "REVERSE",
    "VIEW_TAX",
    "VIEW_AUDIT"
  ],
  [SYSTEM_ROLES.BOOKKEEPER]: ["VIEW", "CREATE", "EDIT", "EXPORT", "POST"],
  [SYSTEM_ROLES.FINANCE_MANAGER]: [
    "VIEW",
    "CREATE",
    "EDIT",
    "APPROVE",
    "EXPORT",
    "POST",
    "CLOSE_PERIOD",
    "VIEW_PAYROLL",
    "VIEW_TAX",
    "VIEW_AUDIT"
  ],
  [SYSTEM_ROLES.AUDITOR]: ["VIEW", "EXPORT", "VIEW_AUDIT"],
  [SYSTEM_ROLES.TAX_AGENT]: ["VIEW", "EXPORT", "VIEW_TAX", "EDIT"],
  [SYSTEM_ROLES.CLIENT_OWNER]: ["VIEW", "CREATE", "EXPORT"],
  [SYSTEM_ROLES.CLIENT_STAFF]: ["VIEW", "CREATE"]
};

/** Map system role → product portal (login destination) */
export function getPortalForRole(roleName: string): AppPortal {
  if ((CLIENT_ROLES as readonly string[]).includes(roleName)) return "client";
  if (roleName === SYSTEM_ROLES.TAX_AGENT) return "tax";
  if (roleName === SYSTEM_ROLES.AUDITOR) return "audit";
  if (roleName === SYSTEM_ROLES.FINANCE_MANAGER) return "manager";
  if (roleName === SYSTEM_ROLES.OWNER || roleName === SYSTEM_ROLES.ADMIN) return "boss";
  return "accountant";
}

export function portalHomePath(portal: AppPortal): string {
  switch (portal) {
    case "client":
      return "/client";
    case "tax":
      return "/tax";
    case "audit":
      return "/auditor";
    case "manager":
      return "/manager";
    case "boss":
      return "/boss";
    default:
      return "/accountant";
  }
}

export function isClientRole(roleName: string): boolean {
  return (CLIENT_ROLES as readonly string[]).includes(roleName);
}

export function isAccountantRole(roleName: string): boolean {
  return (
    (ACCOUNTANT_ROLES as readonly string[]).includes(roleName) ||
    roleName === SYSTEM_ROLES.OWNER ||
    roleName === SYSTEM_ROLES.ADMIN ||
    roleName === SYSTEM_ROLES.FINANCE_MANAGER ||
    roleName === SYSTEM_ROLES.AUDITOR ||
    roleName === SYSTEM_ROLES.TAX_AGENT
  );
}

export const DEMO_ACCOUNTS: Array<{
  email: string;
  password: string;
  roleName: string;
  portal: AppPortal;
  label: string;
  blurb: string;
}> = [
  {
    email: "client@demo.my",
    password: "demo1234",
    roleName: SYSTEM_ROLES.CLIENT_OWNER,
    portal: "client",
    label: "Client",
    blurb: "Upload bills/receipts, checklist, view monthly reports"
  },
  {
    email: "accountant@demo.my",
    password: "demo1234",
    roleName: SYSTEM_ROLES.ACCOUNTANT,
    portal: "accountant",
    label: "Accountant",
    blurb: "Full-set books: inbox, AR/AP, bank, scan, journals"
  },
  {
    email: "tax@demo.my",
    password: "demo1234",
    roleName: SYSTEM_ROLES.TAX_AGENT,
    portal: "tax",
    label: "Tax",
    blurb: "SST input/output, tax pack, LHDN-oriented schedules"
  },
  {
    email: "audit@demo.my",
    password: "demo1234",
    roleName: SYSTEM_ROLES.AUDITOR,
    portal: "audit",
    label: "Audit",
    blurb: "Read-only TB, exceptions, audit trail (no posting)"
  },
  {
    email: "manager@demo.my",
    password: "demo1234",
    roleName: SYSTEM_ROLES.FINANCE_MANAGER,
    portal: "manager",
    label: "Manager",
    blurb: "Month-end review, close period, publish reports"
  },
  {
    email: "boss@demo.my",
    password: "demo1234",
    roleName: SYSTEM_ROLES.OWNER,
    portal: "boss",
    label: "Boss",
    blurb: "Firm oversight, KPIs, users, final accountability"
  }
];
