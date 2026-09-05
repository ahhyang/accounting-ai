import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { createUploadedDocument } from "@/lib/portal/documents";
import { runAiOnDocument } from "@/lib/portal/review";
import { db } from "@/lib/db";
import type { DocumentCategory } from "@prisma/client";

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
    const category = String(form.get("category") || "OTHER") as DocumentCategory;
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

    const documents = [];
    const aiResults = [];

    for (const [index, file] of files.entries()) {
      const doc = await createUploadedDocument({
        companyId,
        periodId,
        category,
        file,
        uploadedByUserId: auth.session.user.id,
        // Only link the first file to a checklist request
        requestId: index === 0 ? requestId : undefined,
        clientNote:
          files.length > 1
            ? [clientNote, `Batch upload ${index + 1}/${files.length}: ${file.name}`]
                .filter(Boolean)
                .join(" — ")
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

      documents.push({
        id: doc.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: file.size,
        status: "IN_REVIEW"
      });
      aiResults.push(ai);
    }

    return NextResponse.json(
      {
        ok: true,
        count: documents.length,
        documents,
        document: documents[0],
        ai: aiResults[0],
        aiResults
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
