import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { getTrialBalance } from "@/lib/accounting/trial-balance";

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId);
  if (!auth.ok) return auth.error;

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId") ?? undefined;

  const tb = await getTrialBalance(params.companyId, { periodId });
  return NextResponse.json({ ok: true, ...tb });
}
