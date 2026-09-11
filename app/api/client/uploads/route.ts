import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { createUploadedDocument, syncChecklistFromCategories } from "@/lib/portal/documents";
import { runAiOnDocument } from "@/lib/portal/review";
import { tidyOneDocument } from "@/lib/portal/tidy-documents";
import { db } from "@/lib/db";
import type { DocumentCategory } from "@prisma/client";
import { round2 } from "@/lib/accounting/helpers";

/** Allow large multipart uploads (any file type). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function collectFiles(form: FormData): File[] {
  const files: File[] = [];
  for (const value of form.getAll("file")) {
    if (value instanceof File && value.size > 0) files.push(value);
  }
  for (const value of form.getAll("files")) {
    if (value instanceof File && value.size > 0) files.push(value);
  }
  return files;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const companyId = String(form.get("companyId") || "");
    const periodId = String(form.get("periodId") || "");
    // Bulk dump: client does not choose category — AI classifies after extract.
    const category = String(form.get("category") || "OTHER") as DocumentCategory;
    const autoClassify = String(form.get("autoClassify") || "1") !== "0";
    const requestId = form.get("requestId") ? String(form.get("requestId")) : undefined;
    const clientNote = form.get("clientNote") ? String(form.get("clientNote")) : undefined;
    const files = collectFiles(form);

    if (!companyId || !periodId || files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "companyId, periodId and at least one file are required." },
        { status: 422 }
      );
    }

    const auth = await requireCompanyAccess(companyId);
    if (!auth.ok) return auth.error;

    const startCategory: DocumentCategory = autoClassify ? "OTHER" : category;

    const documents = [];
    const aiResults = [];
    const tidyResults = [];

    for (const [index, file] of files.entries()) {
      const doc = await createUploadedDocument({
        companyId,
        periodId,
        category: startCategory,
        file,
        uploadedByUserId: auth.session.user.id,
        requestId: !autoClassify && index === 0 ? requestId : undefined,
        clientNote:
          files.length > 1
            ? [clientNote, `Bulk ${index + 1}/${files.length}: ${file.name}`].filter(Boolean).join(" — ")
            : clientNote
      });

      let ai = null;
      try {
        ai = await runAiOnDocument(doc.id);
      } catch {
        await db.sourceDocument.update({
          where: { id: doc.id },
          data: { status: "IN_REVIEW" }
        });
      }

      let tidy = null;
      try {
        tidy = await tidyOneDocument(doc.id, { forceClassify: autoClassify });
      } catch {
        tidy = null;
      }

      documents.push({
        id: doc.id,
        fileName: tidy?.tidyFileName ?? doc.fileName,
        originalFileName: tidy?.originalFileName ?? doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: file.size,
        status: "IN_REVIEW",
        category: tidy?.category ?? startCategory,
        confidence: tidy?.confidence ?? ai?.confidence ?? null,
        fields: tidy?.fields ?? null,
        aiUsed: Boolean(ai?.aiUsed),
        aiError: ai?.aiError ?? null
      });
      aiResults.push(ai);
      tidyResults.push(tidy);
    }

    const categoryCounts: Record<string, number> = {};
    const categoryTotals: Record<string, number> = {};
    for (const d of documents) {
      categoryCounts[d.category] = (categoryCounts[d.category] ?? 0) + 1;
      const total = d.fields?.total;
      if (total != null) {
        categoryTotals[d.category] = round2((categoryTotals[d.category] ?? 0) + total);
      }
    }

    await syncChecklistFromCategories(
      companyId,
      periodId,
      documents.map((d) => d.category as DocumentCategory)
    );

    return NextResponse.json(
      {
        ok: true,
        count: documents.length,
        documents,
        document: documents[0],
        categoryCounts,
        categoryTotals,
        ai: aiResults[0],
        aiResults,
        tidyResults
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
