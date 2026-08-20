import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  creditLimit: z.number().optional(),
  paymentTerms: z.number().int().optional()
});

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string } }
) {
  const customers = await db.customer.findMany({
    where: { companyId: params.companyId },
    include: {
      invoices: {
        where: { status: { in: ["OPEN", "PARTIAL"] } }
      }
    },
    orderBy: { name: "asc" }
  });

  const withBalances = customers.map((c) => ({
    ...c,
    outstanding: c.invoices.reduce(
      (sum, inv) => sum + Number(inv.total) - Number(inv.amountPaid),
      0
    )
  }));

  return NextResponse.json({ ok: true, customers: withBalances });
}

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const payload = schema.parse(await request.json());
    const customer = await db.customer.create({
      data: {
        companyId: params.companyId,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        creditLimit: payload.creditLimit,
        paymentTerms: payload.paymentTerms ?? 30
      }
    });
    return NextResponse.json({ ok: true, customer }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
