import { PrismaClient } from "@prisma/client";
import { DEFAULT_MALAYSIA_COA } from "../lib/accounting/default-coa";
import { MONTH_END_TASKS } from "../lib/accounting/month-end";
import { ROLE_PERMISSION_MAP, SYSTEM_ROLES } from "../lib/permissions/constants";

const db = new PrismaClient();

async function main() {
  const ownerEmail = "owner@demo.my";

  const existing = await db.company.findFirst({
    where: { name: "Demo Company Sdn Bhd" }
  });

  if (existing) {
    console.log("Seed skipped: Demo company already exists.");
    return;
  }

  const now = new Date();
  const fiscalYearStart = new Date(now.getFullYear(), 0, 1);
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const user = await db.user.upsert({
    where: { email: ownerEmail },
    update: { name: "Yong Demo" },
    create: { email: ownerEmail, name: "Yong Demo" }
  });

  const company = await db.company.create({
    data: {
      name: "Demo Company Sdn Bhd",
      registrationNumber: "202401012345",
      businessType: "Sdn Bhd",
      industry: "Technology",
      functionalCurrency: "MYR",
      fiscalYearStart,
      taxSettings: {
        create: {
          sstRegistered: true,
          sstNumber: "SST-123456789",
          taxRegistrationNo: "C1234567890"
        }
      },
      branches: {
        create: [{ name: "KL Branch", code: "KL" }, { name: "Sabah Branch", code: "SB" }]
      },
      departments: {
        create: [{ name: "Finance" }, { name: "Operations" }, { name: "Sales" }]
      },
      costCentres: {
        create: [{ name: "Head Office", code: "HQ" }]
      },
      bankAccounts: {
        create: [
          {
            name: "Main Operating Account",
            bankName: "Maybank",
            accountNumber: "512345678901",
            currency: "MYR"
          }
        ]
      },
      accounts: {
        create: DEFAULT_MALAYSIA_COA.map((a) => ({
          code: a.code,
          name: a.name,
          type: a.type,
          parentCode: a.parentCode,
          allowPosting: !["1000", "2000", "3000", "4000", "5000"].includes(a.code)
        }))
      },
      periods: {
        create: { startDate: periodStart, endDate: periodEnd }
      }
    },
    include: { periods: true }
  });

  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = await db.role.create({
      data: {
        companyId: company.id,
        name: roleName,
        isSystem: true,
        permissions: {
          create: permissions.map((action) => ({ action, resource: "*" }))
        }
      }
    });

    if (roleName === SYSTEM_ROLES.OWNER) {
      await db.companyUser.create({
        data: {
          companyId: company.id,
          userId: user.id,
          roleId: role.id,
          isOwner: true
        }
      });
    }
  }

  const period = company.periods[0];
  await db.monthEndRun.create({
    data: {
      companyId: company.id,
      periodId: period.id,
      completionScore: 0,
      tasks: {
        create: MONTH_END_TASKS.map((task) => ({
          key: task.key,
          label: task.label,
          sortOrder: task.sortOrder
        }))
      }
    }
  });

  console.log("Seed complete.");
  console.log(`Company ID: ${company.id}`);
  console.log(`Owner: ${ownerEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
