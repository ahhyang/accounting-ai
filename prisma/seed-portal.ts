/**
 * Seed portal users (client + accountant) on Demo Company.
 * Run: npx tsx prisma/seed-portal.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { ROLE_PERMISSION_MAP, SYSTEM_ROLES } from "../lib/permissions/constants";
import { ensureMonthChecklist } from "../lib/portal/documents";

const db = new PrismaClient();

async function ensureRole(companyId: string, roleName: string) {
  const permissions = ROLE_PERMISSION_MAP[roleName] ?? ["VIEW", "CREATE"];
  return db.role.upsert({
    where: { companyId_name: { companyId, name: roleName } },
    update: {},
    create: {
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

  // Ensure client roles exist for all ROLE_PERMISSION_MAP keys
  for (const roleName of Object.keys(ROLE_PERMISSION_MAP)) {
    await ensureRole(company.id, roleName);
  }

  const client = await upsertUserWithRole({
    email: "client@demo.my",
    name: "Demo Client Owner",
    password: "demo1234",
    companyId: company.id,
    roleName: SYSTEM_ROLES.CLIENT_OWNER
  });

  const accountant = await upsertUserWithRole({
    email: "accountant@demo.my",
    name: "Demo Accountant",
    password: "demo1234",
    companyId: company.id,
    roleName: SYSTEM_ROLES.ACCOUNTANT
  });

  // Also set password on original owner if exists
  await db.user.updateMany({
    where: { email: "owner@demo.my" },
    data: { passwordHash: await bcrypt.hash("demo1234", 10) }
  });

  const period = company.periods[0];
  if (period) {
    await ensureMonthChecklist(company.id, period.id);
  }

  console.log("Portal users ready.");
  console.log(`Company: ${company.id}`);
  console.log(`Client: ${client.email} / demo1234`);
  console.log(`Accountant: ${accountant.email} / demo1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
