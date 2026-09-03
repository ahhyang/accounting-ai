/**
 * Seed portal users for all firm roles on Demo Company.
 * Run: npx tsx prisma/seed-portal.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import {
  DEMO_ACCOUNTS,
  ROLE_PERMISSION_MAP,
  SYSTEM_ROLES
} from "../lib/permissions/constants";
import { ensureMonthChecklist } from "../lib/portal/documents";

const db = new PrismaClient();

async function ensureRole(companyId: string, roleName: string) {
  const permissions = ROLE_PERMISSION_MAP[roleName] ?? ["VIEW", "CREATE"];
  const existing = await db.role.findUnique({
    where: { companyId_name: { companyId, name: roleName } },
    include: { permissions: true }
  });

  if (existing) {
    // Refresh permissions so Manager gets CLOSE_PERIOD etc.
    await db.rolePermission.deleteMany({ where: { roleId: existing.id } });
    await db.rolePermission.createMany({
      data: permissions.map((action) => ({
        roleId: existing.id,
        action,
        resource: "*"
      }))
    });
    return existing;
  }

  return db.role.create({
    data: {
      companyId,
      name: roleName,
      isSystem: true,
      permissions: {
        create: permissions.map((action) => ({ action, resource: "*" }))
      }
    }
  });
}

async function upsertUserWithRole(input: {
  email: string;
  name: string;
  password: string;
  companyId: string;
  roleName: string;
  isOwner?: boolean;
}) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await db.user.upsert({
    where: { email: input.email },
    update: { name: input.name, passwordHash },
    create: {
      email: input.email,
      name: input.name,
      passwordHash
    }
  });

  const role = await ensureRole(input.companyId, input.roleName);

  await db.companyUser.upsert({
    where: { companyId_userId: { companyId: input.companyId, userId: user.id } },
    update: { roleId: role.id, isOwner: input.isOwner ?? false },
    create: {
      companyId: input.companyId,
      userId: user.id,
      roleId: role.id,
      isOwner: input.isOwner ?? false
    }
  });

  return user;
}

async function main() {
  const company = await db.company.findFirst({
    where: { name: "Demo Company Sdn Bhd" },
    include: { periods: { orderBy: { startDate: "desc" }, take: 1 } }
  });

  if (!company) {
    throw new Error("Demo company missing. Run npm run db:seed first.");
  }

  for (const roleName of Object.keys(ROLE_PERMISSION_MAP)) {
    await ensureRole(company.id, roleName);
  }

  // Ensure SST settings exist for tax portal
  await db.taxSettings.upsert({
    where: { companyId: company.id },
    update: { sstRegistered: true, sstNumber: "W10-1234-56789012", defaultTaxCode: "SST-6%" },
    create: {
      companyId: company.id,
      sstRegistered: true,
      sstNumber: "W10-1234-56789012",
      defaultTaxCode: "SST-6%"
    }
  });

  const created: string[] = [];

  for (const acc of DEMO_ACCOUNTS) {
    const user = await upsertUserWithRole({
      email: acc.email,
      name: `Demo ${acc.label}`,
      password: acc.password,
      companyId: company.id,
      roleName: acc.roleName,
      isOwner: acc.roleName === SYSTEM_ROLES.OWNER
    });
    created.push(`${acc.label}: ${user.email} / ${acc.password} → /${acc.portal === "audit" ? "auditor" : acc.portal}`);
  }

  // Keep legacy owner@demo.my as alias for boss
  await upsertUserWithRole({
    email: "owner@demo.my",
    name: "Demo Owner (Boss)",
    password: "demo1234",
    companyId: company.id,
    roleName: SYSTEM_ROLES.OWNER,
    isOwner: true
  });

  const period = company.periods[0];
  if (period) {
    await ensureMonthChecklist(company.id, period.id);
  }

  console.log("Portal users ready for Malaysian firm roles.");
  console.log(`Company: ${company.id}`);
  created.forEach((line) => console.log(line));
  console.log("Also: owner@demo.my / demo1234 (Boss)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
