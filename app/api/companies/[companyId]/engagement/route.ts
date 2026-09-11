import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireFirmAdmin } from "@/lib/auth/session";
import { writeAuditEvent } from "@/lib/audit/log";

const schema = z.object({
  engagementStatus: z.enum(["ONBOARDING", "ACTIVE", "ON_HOLD", "COMPLETED"]).optional(),
  billingStatus: z.enum(["NOT_BILLED", "INVOICED", "PAID", "OVERDUE"]).optional(),
  accountingFee: z.number().min(0).nullable().optional(),
  amountDue: z.number().min(0).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  lastPaymentDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireFirmAdmin();
  if (!auth.ok) return auth.error;

  const engagement = await db.clientEngagement.findUnique({
    where: { companyId: params.companyId }
  });

  return NextResponse.json({ ok: true, engagement });
}

export async function PATCH(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const auth = await requireFirmAdmin();
  if (!auth.ok) return auth.error;

  try {
    const payload = schema.parse(await request.json());
    const company = await db.company.findUnique({ where: { id: params.companyId } });
    if (!company) {
      return NextResponse.json({ ok: false, error: "Company not found." }, { status: 404 });
    }

    const toDate = (v: string | null | undefined) =>
      v == null ? null : v === "" ? null : new Date(v);

    const data = {
      engagementStatus: payload.engagementStatus,
      billingStatus: payload.billingStatus,
      accountingFee: payload.accountingFee ?? undefined,
      amountDue: payload.amountDue ?? undefined,
      dueDate: toDate(payload.dueDate),
      invoiceNumber: payload.invoiceNumber,
      lastPaymentDate: toDate(payload.lastPaymentDate),
      notes: payload.notes
    };

    const engagement = await db.clientEngagement.upsert({
      where: { companyId: params.companyId },
      update: data,
      create: {
        companyId: params.companyId,
        engagementStatus: payload.engagementStatus ?? "ONBOARDING",
        billingStatus: payload.billingStatus ?? "NOT_BILLED",
        accountingFee: payload.accountingFee ?? null,
        amountDue: payload.amountDue ?? null,
        dueDate: toDate(payload.dueDate),
        invoiceNumber: payload.invoiceNumber ?? null,
        lastPaymentDate: toDate(payload.lastPaymentDate),
        notes: payload.notes ?? null
      }
    });

    await writeAuditEvent({
      companyId: params.companyId,
      actorUserId: auth.session.user.id,
      entityType: "ClientEngagement",
      entityId: engagement.id,
      action: "UPDATE_ENGAGEMENT",
      afterJson: {
        engagementStatus: engagement.engagementStatus,
        billingStatus: engagement.billingStatus,
        amountDue: engagement.amountDue != null ? Number(engagement.amountDue) : null
      }
    });

    return NextResponse.json({ ok: true, engagement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Update failed." },
      { status: 500 }
    );
  }
}
