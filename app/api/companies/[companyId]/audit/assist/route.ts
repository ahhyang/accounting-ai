import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { runAuditAssistant } from "@/lib/audit/ai-auditor";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId, {
    permission: "VIEW_AUDIT",
    portal: "staff"
  });
  if (!auth.ok) return auth.error;

  let periodId: string | undefined;
  try {
    const body = (await request.json()) as { periodId?: string };
    periodId = body.periodId;
  } catch {
    periodId = undefined;
  }

  try {
    const result = await runAuditAssistant({
      companyId: params.companyId,
      periodId,
      actorUserId: auth.session.user.id
    });
    return NextResponse.json({ ok: true, audit: result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Audit assistant failed." },
      { status: 500 }
    );
  }
}
