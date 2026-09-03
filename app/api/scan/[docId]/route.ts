import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { postScannedBillToAccounting, type ScanBillForm } from "@/lib/portal/bill-from-scan";
import { singleBillToExcelBuffer } from "@/lib/export/excel";
import type { DocumentCategory } from "@prisma/client";
import type { ExtractedBill } from "@/lib/ai/extraction";

const formSchema = z.object({
  merchantName: z.string().min(1),
  documentNumber: z.string().optional(),
  billDate: z.string().min(1),
  dueDate: z.string().min(1),
  subtotal: z.number().min(0),
  taxAmount: z.number().min(0),
  description: z.string().optional()
});

export async function GET(
  _request: Request,
  { params }: { params: { docId: string } }
) {
  const doc = await db.sourceDocument.findUnique({
    where: { id: params.docId },
    include: {
      suggestions: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });

  if (!doc) {
    return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  }

  const auth = await requireCompanyAccess(doc.companyId);
  if (!auth.ok) return auth.error;

  const payload = doc.suggestions[0]?.payload as { extracted?: ExtractedBill } | undefined;
  const extracted = payload?.extracted ?? (doc.extractedJson as { extracted?: ExtractedBill })?.extracted;

  return NextResponse.json({
    ok: true,
    document: {
      id: doc.id,
      companyId: doc.companyId,
      fileName: doc.fileName,
      category: doc.category,
      status: doc.status,
      previewUrl: doc.fileUrl,
      aiConfidence: doc.aiConfidence,
      extractedJson: doc.extractedJson
    },
    extracted
  });
}

export async function POST(
  request: Request,
  { params }: { params: { docId: string } }
) {
  try {
    const body = await request.json();
    const action = String(body.action || "");

    const doc = await db.sourceDocument.findUnique({ where: { id: params.docId } });
    if (!doc) {
      return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
    }

    const auth = await requireCompanyAccess(doc.companyId);
    if (!auth.ok) return auth.error;

    if (action === "save_form") {
      const form = formSchema.parse(body.form) as ScanBillForm;
      await db.sourceDocument.update({
        where: { id: doc.id },
        data: {
          extractedJson: {
            ...(doc.extractedJson as object),
            form
          },
          documentDate: new Date(form.billDate)
        }
      });
      return NextResponse.json({ ok: true, saved: true });
    }

    if (action === "export_excel") {
      const form = formSchema.parse(body.form) as ScanBillForm;
      const category = (body.category ?? doc.category) as DocumentCategory;
      const extracted =
        body.extracted ??
        (doc.extractedJson as { extracted?: ExtractedBill })?.extracted;

      const buffer = singleBillToExcelBuffer(form, category, extracted);
      const filename = `bill-${form.documentNumber || doc.id.slice(0, 8)}.xlsx`;

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`
        }
      });
    }

    if (action === "post_to_accounting") {
      const form = formSchema.parse(body.form) as ScanBillForm;
      const category = (body.category ?? doc.category) as DocumentCategory;

      const result = await postScannedBillToAccounting({
        companyId: doc.companyId,
        documentId: doc.id,
        category,
        form,
        actorUserId: auth.session.user.id
      });

      return NextResponse.json({
        ok: true,
        result: {
          type: result.type,
          id: result.type === "purchase" ? result.bill.id : result.invoice.id,
          number:
            result.type === "purchase" ? result.bill.billNumber : result.invoice.invoiceNumber,
          journalId: result.journal.id
        },
        nextStep:
          result.type === "purchase"
            ? `/purchases?companyId=${doc.companyId}`
            : `/sales?companyId=${doc.companyId}`
      });
    }

    if (action === "send_to_review") {
      await runAiReview(doc.id);
      return NextResponse.json({ ok: true, status: "IN_REVIEW" });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : "Action failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function runAiReview(documentId: string) {
  const { runAiOnDocument } = await import("@/lib/portal/review");
  await runAiOnDocument(documentId);
}
