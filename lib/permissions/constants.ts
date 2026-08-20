import type { PermissionAction } from "@prisma/client";

export const SYSTEM_ROLES = {
  OWNER: "Owner",
  ADMIN: "Admin",
  ACCOUNTANT: "Accountant",
  BOOKKEEPER: "Bookkeeper",
  FINANCE_MANAGER: "Finance Manager",
  AUDITOR: "Auditor",
  TAX_AGENT: "Tax Agent"
} as const;

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
  [SYSTEM_ROLES.TAX_AGENT]: ["VIEW", "EXPORT", "VIEW_TAX"]
};
