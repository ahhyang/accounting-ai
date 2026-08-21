import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { PermissionAction } from "@prisma/client";
import { authOptions } from "@/lib/auth/options";
import { db } from "@/lib/db";
import { userHasPermission } from "@/lib/permissions/check";
import { isClientRole } from "@/lib/permissions/constants";

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false as const, error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true as const, session };
}

export async function requireCompanyAccess(
  companyId: string,
  options?: { permission?: PermissionAction; portal?: "client" | "accountant" }
) {
  const result = await requireSession();
  if (!result.ok) return result;

  const { session } = result;
  const membership = await db.companyUser.findUnique({
    where: {
      companyId_userId: { companyId, userId: session.user.id }
    },
    include: { role: true }
  });

  if (!membership) {
    return {
      ok: false as const,
      error: NextResponse.json({ ok: false, error: "Forbidden for this company." }, { status: 403 })
    };
  }

  if (options?.portal === "accountant" && isClientRole(membership.role.name)) {
    return {
      ok: false as const,
      error: NextResponse.json({ ok: false, error: "Accountant access required." }, { status: 403 })
    };
  }

  if (options?.permission) {
    const allowed = await userHasPermission(companyId, session.user.id, options.permission);
    if (!allowed) {
      return {
        ok: false as const,
        error: NextResponse.json({ ok: false, error: "Missing permission." }, { status: 403 })
      };
    }
  }

  return {
    ok: true as const,
    session,
    membership,
    roleName: membership.role.name
  };
}
