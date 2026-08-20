import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { AccountType } from "@prisma/client";

const createAccountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  parentCode: z.string().optional(),
  allowPosting: z.boolean().optional()
});

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string } }
) {
  const accounts = await db.account.findMany({
    where: { companyId: params.companyId },
    orderBy: { code: "asc" }
  });

  return NextResponse.json({ ok: true, accounts });
}

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  try {
    const json = await request.json();
    const payload = createAccountSchema.parse(json);

    const account = await db.account.create({
      data: {
        companyId: params.companyId,
        code: payload.code,
        name: payload.name,
        type: payload.type as AccountType,
        parentCode: payload.parentCode,
        allowPosting: payload.allowPosting ?? true
      }
    });

    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }

    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
