import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth/session";
import {
  autoMatchBankTransactions,
  getReconciliationSummary,
  importBankTransactions
} from "@/lib/banking/reconciliation";

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId, { permission: "VIEW" });
  if (!auth.ok) return auth.error;

  const bankAccountId = new URL(request.url).searchParams.get("bankAccountId");

  if (!bankAccountId) {
    const accounts = await db.bankAccount.findMany({
      where: { companyId: params.companyId },
      orderBy: { name: "asc" }
    });
    return NextResponse.json({ ok: true, accounts });
  }

  const summary = await getReconciliationSummary(params.companyId, bankAccountId);
  if (!summary) {
    return NextResponse.json({ ok: false, error: "Bank account not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...summary });
}

const importSchema = z.object({
  bankAccountId: z.string().min(1),
  transactions: z
    .array(
      z.object({
        txnDate: z.string().min(1),
        amount: z.number(),
        description: z.string().optional(),
        reference: z.string().optional()
      })
    )
    .min(1)
});

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const auth = await requireCompanyAccess(params.companyId, { permission: "CREATE" });
    if (!auth.ok) return auth.error;

    const json = await request.json();
    const action = json.action as string | undefined;

    if (action === "match") {
      const bankAccountId = z.string().min(1).parse(json.bankAccountId);
      const result = await autoMatchBankTransactions(params.companyId, bankAccountId);
      return NextResponse.json({ ok: true, ...result });
    }

    const payload = importSchema.parse(json);
    const account = await db.bankAccount.findFirst({
      where: { id: payload.bankAccountId, companyId: params.companyId }
    });

    if (!account) {
      return NextResponse.json({ ok: false, error: "Bank account not found." }, { status: 404 });
    }

    const created = await importBankTransactions(payload.bankAccountId, payload.transactions);
    const match = await autoMatchBankTransactions(params.companyId, payload.bankAccountId);

    return NextResponse.json(
      {
        ok: true,
        imported: created.count,
        match
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
