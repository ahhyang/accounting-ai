import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { getBooksOverview } from "@/lib/accounting/books-overview";

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId, { portal: "staff" });
  if (!auth.ok) return auth.error;

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId") ?? undefined;

  const overview = await getBooksOverview(params.companyId, periodId);
  return NextResponse.json({ ok: true, ...overview });
}
