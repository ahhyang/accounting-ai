import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyAccess } from "@/lib/auth/session";
import { createArReceipt } from "@/lib/ar/service";
import { PostingError } from "@/lib/accounting/posting";

const schema = z.object({
  customerId: z.string().min(1),
  invoiceId: z.string().min(1),
  receiptDate: z.string().min(1),
  amount: z.number().positive(),
  reference: z.string().optional()
});

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const auth = await requireCompanyAccess(params.companyId, { permission: "CREATE" });
    if (!auth.ok) return auth.error;

    const payload = schema.parse(await request.json());
    const result = await createArReceipt({
      companyId: params.companyId,
      ...payload
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof PostingError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
