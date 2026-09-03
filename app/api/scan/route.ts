import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { createUploadedDocument } from "@/lib/portal/documents";
import { extractedToForm } from "@/lib/portal/bill-from-scan";
import { fileToDataUrl, isScannableMime } from "@/lib/portal/document-file";
import { extractFromScannedFile, buildScanFallback } from "@/lib/portal/scan-extract";
import { db } from "@/lib/db";
import type { DocumentCategory } from "@prisma/client";
import type { ExtractionResult } from "@/lib/ai/extraction";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const companyId = String(form.get("companyId") || "");
    const periodId = String(form.get("periodId") || "");
    const category = String(form.get("category") || "PURCHASE") as DocumentCategory;
    const clientNote = form.get("clientNote") ? String(form.get("clientNote")) : undefined;
    const file = form.get("file");

    if (!companyId || !periodId || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "companyId, periodId and file are required." },
        { status: 422 }
      );
    }

    if (!isScannableMime(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Please upload an image (JPG, PNG, WEBP) or PDF receipt/bill." },
        { status: 422 }
      );
    }

    const auth = await requireCompanyAccess(companyId);
    if (!auth.ok) return auth.error;

    const doc = await createUploadedDocument({
      companyId,
      periodId,
      category,
      file,
      uploadedByUserId: auth.session.user.id,
      clientNote
    });

    let extraction: ExtractionResult;
    let confidence = 50;

    try {
      const resolved = await fileToDataUrl(file);
      const { result } = await extractFromScannedFile({
        file: resolved,
        category,
        clientNote,
        fileName: file.name
      });
      extraction = result;
      confidence = result.confidence;
    } catch {
      extraction = buildScanFallback(category, file.name);
      confidence = extraction.confidence;
    }

    await db.sourceDocument.update({
      where: { id: doc.id },
      data: {
        status: "IN_REVIEW",
        aiConfidence: confidence,
        extractedJson: extraction as unknown as object,
        documentDate: extraction.extracted.date ? new Date(extraction.extracted.date) : undefined
      }
    });

    await db.aiSuggestion.create({
      data: {
        companyId,
        sourceDocumentId: doc.id,
        type: "BOOKKEEPING_PROPOSAL",
        status: "PROPOSED",
        confidence,
        payload: extraction as unknown as object
      }
    });

    const billForm = extractedToForm(extraction.extracted, category);

    return NextResponse.json(
      {
        ok: true,
        document: {
          id: doc.id,
          fileName: doc.fileName,
          category: doc.category,
          status: "IN_REVIEW",
          previewUrl: doc.fileUrl
        },
        extraction,
        form: billForm,
        confidence
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
