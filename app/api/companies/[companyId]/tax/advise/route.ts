import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { runTaxAdvise } from "@/lib/tax/ai-advisor";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId, { permission: "VIEW_TAX" });
  if (!auth.ok) return auth.error;

  let periodId: string | undefined;
  try {
    const body = (await request.json()) as { periodId?: string };
    periodId = body.periodId;
  } catch {
    periodId = undefined;
  }

  try {
    const advise = await runTaxAdvise({
      companyId: params.companyId,
      periodId,
      actorUserId: auth.session.user.id
    });
    return NextResponse.json({ ok: true, advise });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Tax advise failed." },
      { status: 500 }
    );
  }
}
