import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { getSstTaxPack } from "@/lib/tax/sst-summary";

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId, { permission: "VIEW_TAX" });
  if (!auth.ok) return auth.error;

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId") ?? undefined;

  const pack = await getSstTaxPack(params.companyId, periodId);
  return NextResponse.json({ ok: true, ...pack });
}
