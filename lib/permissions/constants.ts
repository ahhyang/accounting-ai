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

export const CLIENT_ROLES = [SYSTEM_ROLES.CLIENT_OWNER, SYSTEM_ROLES.CLIENT_STAFF] as const;

export const ACCOUNTANT_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.BOOKKEEPER,
  SYSTEM_ROLES.FINANCE_MANAGER,
  SYSTEM_ROLES.AUDITOR,
  SYSTEM_ROLES.TAX_AGENT
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
    "VIEW_PAYROLL",
    "VIEW_TAX"
  ],
  [SYSTEM_ROLES.AUDITOR]: ["VIEW", "EXPORT", "VIEW_AUDIT"],
  [SYSTEM_ROLES.TAX_AGENT]: ["VIEW", "EXPORT", "VIEW_TAX"],
  [SYSTEM_ROLES.CLIENT_OWNER]: ["VIEW", "CREATE", "EXPORT"],
  [SYSTEM_ROLES.CLIENT_STAFF]: ["VIEW", "CREATE"]
};

export function isClientRole(roleName: string): boolean {
  return (CLIENT_ROLES as readonly string[]).includes(roleName);
}

export function isAccountantRole(roleName: string): boolean {
  return (ACCOUNTANT_ROLES as readonly string[]).includes(roleName);
}
