import { NextResponse } from "next/server";
import { z } from "zod";
import { createApPayment } from "@/lib/ap/service";
import { PostingError } from "@/lib/accounting/posting";

const schema = z.object({
  supplierId: z.string().min(1),
  billId: z.string().min(1),
  paymentDate: z.string().min(1),
  amount: z.number().positive(),
  reference: z.string().optional()
});

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const payload = schema.parse(await request.json());
    const result = await createApPayment({
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
