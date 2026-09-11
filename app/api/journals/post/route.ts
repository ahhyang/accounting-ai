import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyAccess } from "@/lib/auth/session";
import { createAndPostJournal, PostingError } from "@/lib/accounting/posting";

const lineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.number().min(0).optional(),
  credit: z.number().min(0).optional(),
  memo: z.string().optional()
});

const payloadSchema = z.object({
  companyId: z.string().min(1),
  journalDate: z.string().min(1),
  journalNumber: z.string().min(1),
  description: z.string().optional(),
  sourceDocumentId: z.string().optional(),
  lines: z.array(lineSchema).min(2)
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = payloadSchema.parse(json);

    const auth = await requireCompanyAccess(payload.companyId, { permission: "POST" });
    if (!auth.ok) return auth.error;

    const posted = await createAndPostJournal(payload);

    return NextResponse.json({
      ok: true,
      journalEntry: posted
    });
  } catch (error) {
    if (error instanceof PostingError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }

    const fallback = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
  }
}
