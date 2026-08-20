import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createPurchaseBill, findDuplicateBills, getApAging } from "@/lib/ap/service";
import { PostingError } from "@/lib/accounting/posting";

const schema = z.object({
  supplierId: z.string().min(1),
  billDate: z.string().min(1),
  dueDate: z.string().min(1),
  description: z.string().optional(),
  subtotal: z.number().positive(),
  taxAmount: z.number().min(0).optional(),
  billNumber: z.string().optional()
});

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get("aging") === "1") {
    const aging = await getApAging(params.companyId);
    return NextResponse.json({ ok: true, aging });
  }

  if (searchParams.get("duplicates") === "1") {
    const duplicates = await findDuplicateBills(params.companyId);
    return NextResponse.json({ ok: true, duplicates });
  }

  const bills = await db.purchaseBill.findMany({
    where: { companyId: params.companyId },
    include: { supplier: true },
    orderBy: { billDate: "desc" }
  });

  return NextResponse.json({ ok: true, bills });
}

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const payload = schema.parse(await request.json());
    const result = await createPurchaseBill({
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
