import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyAccess } from "@/lib/auth/session";
import { closeAccountingPeriod, reopenAccountingPeriod } from "@/lib/accounting/period-close";
import { PostingError } from "@/lib/accounting/posting";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId);
  if (!auth.ok) return auth.error;

  const periods = await db.accountingPeriod.findMany({
    where: { companyId: params.companyId },
    orderBy: { startDate: "desc" }
  });

  return NextResponse.json({ ok: true, periods });
}

const bodySchema = z.object({
  periodId: z.string().min(1),
  action: z.enum(["close", "reopen"]),
  force: z.boolean().optional()
});

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const auth = await requireCompanyAccess(params.companyId, {
      permission: "CLOSE_PERIOD"
    });
    if (!auth.ok) return auth.error;

    const body = bodySchema.parse(await request.json());

    if (body.action === "close") {
      const result = await closeAccountingPeriod({
        companyId: params.companyId,
        periodId: body.periodId,
        actorUserId: auth.session.user.id,
        force: body.force && (auth.session.user.isOwner || auth.session.user.portal === "boss")
      });
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await reopenAccountingPeriod({
      companyId: params.companyId,
      periodId: body.periodId,
      actorUserId: auth.session.user.id
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PostingError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
