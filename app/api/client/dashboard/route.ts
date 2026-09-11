import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getClientDashboard } from "@/lib/firm/portfolio";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.error;

  const companyId = auth.session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "No company on session." }, { status: 400 });
  }

  try {
    const dashboard = await getClientDashboard(companyId);
    return NextResponse.json({ ok: true, ...dashboard });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load dashboard." },
      { status: 500 }
    );
  }
}
