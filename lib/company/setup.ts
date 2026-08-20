import { db } from "@/lib/db";
import { DEFAULT_MALAYSIA_COA } from "@/lib/accounting/default-coa";
import { MONTH_END_TASKS } from "@/lib/accounting/month-end";
import { ROLE_PERMISSION_MAP, SYSTEM_ROLES } from "@/lib/permissions/constants";

export type CreateCompanyInput = {
  name: string;
  registrationNumber?: string;
  businessType?: string;
  industry?: string;
  functionalCurrency?: string;
  ownerEmail: string;
  ownerName: string;
};

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export async function createCompanyWithDefaults(input: CreateCompanyInput) {
  const now = new Date();
  const fiscalYearStart = new Date(now.getFullYear(), 0, 1);

  return db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: input.ownerEmail },
      update: { name: input.ownerName },
      create: { email: input.ownerEmail, name: input.ownerName }
    });

    const company = await tx.company.create({
      data: {
        name: input.name,
        registrationNumber: input.registrationNumber,
        businessType: input.businessType,
        industry: input.industry,
        functionalCurrency: input.functionalCurrency ?? "MYR",
        fiscalYearStart,
        taxSettings: {
          create: {
            sstRegistered: false
          }
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
          create: {
            startDate: startOfMonth(now),
            endDate: endOfMonth(now)
          }
        }
      },
      include: {
        accounts: true,
        periods: true
      }
    });

    for (const [roleName, permissions] of Object.entries(ROLE_PERMISSION_MAP)) {
      const role = await tx.role.create({
        data: {
          companyId: company.id,
          name: roleName,
          isSystem: true,
          description: `System role: ${roleName}`,
          permissions: {
            create: permissions.map((action) => ({
              action,
              resource: "*"
            }))
          }
        }
      });

      if (roleName === SYSTEM_ROLES.OWNER) {
        await tx.companyUser.create({
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
    const monthEndRun = await tx.monthEndRun.create({
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
      },
      include: { tasks: { orderBy: { sortOrder: "asc" } } }
    });

    return { company, user, monthEndRun };
  });
}

export async function getOrCreateMonthEndRun(companyId: string, periodId: string) {
  const existing = await db.monthEndRun.findUnique({
    where: { companyId_periodId: { companyId, periodId } },
    include: { tasks: { orderBy: { sortOrder: "asc" } } }
  });

  if (existing) return existing;

  return db.monthEndRun.create({
    data: {
      companyId,
      periodId,
      completionScore: 0,
      tasks: {
        create: MONTH_END_TASKS.map((task) => ({
          key: task.key,
          label: task.label,
          sortOrder: task.sortOrder
        }))
      }
    },
    include: { tasks: { orderBy: { sortOrder: "asc" } } }
  });
}
