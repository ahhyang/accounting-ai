import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { extractedToForm } from "@/lib/portal/bill-from-scan";
import { multipleBillsToExcelBuffer } from "@/lib/export/excel";
import type { ExtractedBill } from "@/lib/ai/extraction";

export async function GET(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  if (format !== "xlsx") {
    return NextResponse.json({ ok: false, error: "Use ?format=xlsx to download." }, { status: 400 });
  }

  const auth = await requireCompanyAccess(params.companyId);
  if (!auth.ok) return auth.error;

  const bills = await db.purchaseBill.findMany({
    where: { companyId: params.companyId },
    include: { supplier: true },
    orderBy: { billDate: "desc" }
  });

  const items = bills.map((bill) => ({
    category: "PURCHASE",
    form: extractedToForm(
      {
        supplier: bill.supplier.name,
        date: bill.billDate.toISOString().slice(0, 10),
        dueDate: bill.dueDate.toISOString().slice(0, 10),
        subtotal: Number(bill.subtotal),
        tax: Number(bill.taxAmount),
        total: Number(bill.total),
        documentNumber: bill.billNumber,
        notes: bill.description ?? undefined
      },
      "PURCHASE"
    ),
    extracted: {
      supplier: bill.supplier.name,
      documentNumber: bill.billNumber,
      notes: bill.description ?? undefined
    } as ExtractedBill
  }));

  const buffer = multipleBillsToExcelBuffer(items);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="purchase-bills-${params.companyId.slice(0, 8)}.xlsx"`
    }
  });
}
