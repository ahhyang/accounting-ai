import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { getFirmOverview } from "@/lib/firm/overview";
import { getTrialBalance } from "@/lib/accounting/trial-balance";
import { findDuplicateBills } from "@/lib/ap/service";
import { db } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId);
  if (!auth.ok) return auth.error;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "overview";

  if (view === "audit") {
    const periodId = searchParams.get("periodId") ?? undefined;
    const [tb, duplicates, lowConfidence, needsClient, recentAudit] = await Promise.all([
      getTrialBalance(params.companyId, { periodId: periodId ?? undefined }),
      findDuplicateBills(params.companyId),
      db.sourceDocument.findMany({
        where: {
          companyId: params.companyId,
          aiConfidence: { lt: 70 },
          status: { in: ["IN_REVIEW", "UPLOADED"] }
        },
        take: 20,
        orderBy: { createdAt: "desc" }
      }),
      db.sourceDocument.count({
        where: { companyId: params.companyId, status: "NEEDS_CLIENT" }
      }),
      db.auditEvent.findMany({
        where: { companyId: params.companyId },
        orderBy: { createdAt: "desc" },
        take: 30
      })
    ]);

    return NextResponse.json({
      ok: true,
      trialBalance: tb,
      exceptions: {
        duplicateBills: duplicates.length,
        lowConfidenceDocs: lowConfidence,
        waitingOnClient: needsClient
      },
      auditTrail: recentAudit
    });
  }

  const overview = await getFirmOverview(params.companyId);
  return NextResponse.json({ ok: true, ...overview });
}
