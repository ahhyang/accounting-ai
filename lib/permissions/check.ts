import type { PermissionAction } from "@prisma/client";
import { db } from "@/lib/db";

export async function userHasPermission(
  companyId: string,
  userId: string,
  action: PermissionAction,
  resource = "*"
): Promise<boolean> {
  const membership = await db.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId } },
    include: {
      role: {
        include: { permissions: true }
      }
    }
  });

  if (!membership) return false;
  if (membership.isOwner) return true;

  return membership.role.permissions.some(
    (p) => p.action === action && (p.resource === "*" || p.resource === resource)
  );
}

export async function getUserPermissions(companyId: string, userId: string) {
  const membership = await db.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId } },
    include: {
      role: {
        include: { permissions: true }
      },
      user: true
    }
  });

  if (!membership) return null;

  const permissions = membership.isOwner
    ? [{ action: "ALL" as const, resource: "*" }]
    : membership.role.permissions.map((p) => ({
        action: p.action,
        resource: p.resource
      }));

  return {
    user: membership.user,
    role: membership.role.name,
    isOwner: membership.isOwner,
    permissions
  };
}
