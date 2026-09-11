import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth/session";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  paymentTerms: z.number().int().optional()
});

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireCompanyAccess(params.companyId, { permission: "VIEW" });
  if (!auth.ok) return auth.error;

  const suppliers = await db.supplier.findMany({
    where: { companyId: params.companyId },
    include: {
      bills: { where: { status: { in: ["OPEN", "PARTIAL"] } } }
    },
    orderBy: { name: "asc" }
  });

  const withBalances = suppliers.map((s) => ({
    ...s,
    outstanding: s.bills.reduce(
      (sum, bill) => sum + Number(bill.total) - Number(bill.amountPaid),
      0
    )
  }));

  return NextResponse.json({ ok: true, suppliers: withBalances });
}

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const auth = await requireCompanyAccess(params.companyId, { permission: "CREATE" });
    if (!auth.ok) return auth.error;

    const payload = schema.parse(await request.json());
    const supplier = await db.supplier.create({
      data: {
        companyId: params.companyId,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        paymentTerms: payload.paymentTerms ?? 30
      }
    });
    return NextResponse.json({ ok: true, supplier }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
