import { NextResponse } from "next/server";
import { requireFirmAdmin } from "@/lib/auth/session";
import { getFirmPortfolio } from "@/lib/firm/portfolio";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireFirmAdmin();
  if (!auth.ok) return auth.error;

  try {
    const portfolio = await getFirmPortfolio();
    return NextResponse.json({ ok: true, ...portfolio });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load portfolio." },
      { status: 500 }
    );
  }
}
