import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { SYSTEM_ROLES } from "@/lib/permissions/constants";
import { writeAuditEvent } from "@/lib/audit/log";

const schema = z.object({
  companyId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6).default("demo1234"),
  role: z.enum(["CLIENT_OWNER", "CLIENT_STAFF"]).default("CLIENT_OWNER")
});

export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;

  const payload = schema.parse(await request.json());
  const membership = await db.companyUser.findUnique({
    where: {
      companyId_userId: {
        companyId: payload.companyId,
        userId: auth.session.user.id
      }
    },
    include: { role: true }
  });

  if (!membership || !["Owner", "Admin", "Accountant"].includes(membership.role.name)) {
    return NextResponse.json({ ok: false, error: "Not allowed to invite clients." }, { status: 403 });
  }

  const roleName =
    payload.role === "CLIENT_STAFF" ? SYSTEM_ROLES.CLIENT_STAFF : SYSTEM_ROLES.CLIENT_OWNER;

  let role = await db.role.findUnique({
    where: { companyId_name: { companyId: payload.companyId, name: roleName } }
  });

  if (!role) {
    role = await db.role.create({
      data: {
        companyId: payload.companyId,
        name: roleName,
        isSystem: true,
        permissions: {
          create: [
            { action: "VIEW", resource: "*" },
            { action: "CREATE", resource: "*" },
            ...(payload.role === "CLIENT_OWNER" ? [{ action: "EXPORT" as const, resource: "*" }] : [])
          ]
        }
      }
    });
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);
  const user = await db.user.upsert({
    where: { email: payload.email.toLowerCase() },
    update: { name: payload.name, passwordHash },
    create: {
      email: payload.email.toLowerCase(),
      name: payload.name,
      passwordHash
    }
  });

  await db.companyUser.upsert({
    where: { companyId_userId: { companyId: payload.companyId, userId: user.id } },
    update: { roleId: role.id },
    create: {
      companyId: payload.companyId,
      userId: user.id,
      roleId: role.id,
      isOwner: false
    }
  });

  await writeAuditEvent({
    companyId: payload.companyId,
    actorUserId: auth.session.user.id,
    entityType: "User",
    entityId: user.id,
    action: "INVITE_CLIENT",
    afterJson: { email: user.email, role: roleName }
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
    tempPassword: payload.password
  });
}

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;

  const memberships = await db.companyUser.findMany({
    where: { userId: auth.session.user.id },
    include: {
      company: {
        include: {
          memberships: {
            include: { user: true, role: true }
          }
        }
      }
    }
  });

  return NextResponse.json({
    ok: true,
    companies: memberships.map((m) => ({
      id: m.company.id,
      name: m.company.name,
      members: m.company.memberships.map((cu) => ({
        email: cu.user.email,
        name: cu.user.name,
        role: cu.role.name
      }))
    }))
  });
}
