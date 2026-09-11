import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { SYSTEM_ROLES } from "@/lib/permissions/constants";
import { createCompanyWithDefaults } from "@/lib/company/setup";

const createSchema = z.object({
  name: z.string().min(1),
  registrationNumber: z.string().optional(),
  businessType: z.string().optional(),
  industry: z.string().optional(),
  functionalCurrency: z.string().optional(),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1)
});

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;

  const memberships = await db.companyUser.findMany({
    where: { userId: auth.session.user.id },
    select: { companyId: true, isOwner: true, role: { select: { name: true } } }
  });

  const isFirmAdmin = memberships.some(
    (m) => m.isOwner || m.role.name === SYSTEM_ROLES.OWNER || m.role.name === SYSTEM_ROLES.ADMIN
  );

  const companies = await db.company.findMany({
    where: isFirmAdmin ? {} : { id: { in: memberships.map((m) => m.companyId) } },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { accounts: true, memberships: true } },
      taxSettings: true
    }
  });

  return NextResponse.json({ ok: true, companies });
}

export async function POST(request: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.error;

    const json = await request.json();
    const payload = createSchema.parse(json);
    const result = await createCompanyWithDefaults(payload);

    return NextResponse.json(
      {
        ok: true,
        company: result.company,
        owner: result.user,
        monthEndRun: result.monthEndRun
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }

    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
