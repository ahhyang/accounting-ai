import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth/session";
import { createSalesInvoice, getArAging } from "@/lib/ar/service";
import { PostingError } from "@/lib/accounting/posting";

const schema = z.object({
  customerId: z.string().min(1),
  invoiceDate: z.string().min(1),
  dueDate: z.string().min(1),
  description: z.string().optional(),
  subtotal: z.number().positive(),
  taxAmount: z.number().min(0).optional(),
  invoiceNumber: z.string().optional()
});

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId, { permission: "VIEW" });
  if (!auth.ok) return auth.error;

  const aging = new URL(request.url).searchParams.get("aging") === "1";

  if (aging) {
    const rows = await getArAging(params.companyId);
    return NextResponse.json({ ok: true, aging: rows });
  }

  const invoices = await db.salesInvoice.findMany({
    where: { companyId: params.companyId },
    include: { customer: true },
    orderBy: { invoiceDate: "desc" }
  });

  return NextResponse.json({ ok: true, invoices });
}

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const auth = await requireCompanyAccess(params.companyId, { permission: "CREATE" });
    if (!auth.ok) return auth.error;

    const payload = schema.parse(await request.json());
    const result = await createSalesInvoice({
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
