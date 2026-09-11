import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { isClientRole } from "@/lib/permissions/constants";
import { tidyCompanyDocuments } from "@/lib/portal/tidy-documents";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    companyId?: string;
    periodId?: string;
    reRunAi?: boolean;
    autoPostReady?: boolean;
    minConfidenceToPost?: number;
  };

  if (!body.companyId) {
    return NextResponse.json({ ok: false, error: "companyId is required." }, { status: 400 });
  }

  const auth = await requireCompanyAccess(body.companyId);
  if (!auth.ok) return auth.error;

  if (isClientRole(auth.session.user.roleName)) {
    return NextResponse.json({ ok: false, error: "Accountant access required." }, { status: 403 });
  }

  try {
    const result = await tidyCompanyDocuments({
      companyId: body.companyId,
      periodId: body.periodId,
      actorUserId: auth.session.user.id,
      reRunAi: Boolean(body.reRunAi),
      autoPostReady: Boolean(body.autoPostReady),
      minConfidenceToPost: body.minConfidenceToPost ?? 85
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Tidy failed." },
      { status: 500 }
    );
  }
}
