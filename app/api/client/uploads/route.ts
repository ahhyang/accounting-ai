import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth/session";
import { createUploadedDocument } from "@/lib/portal/documents";
import { runAiOnDocument } from "@/lib/portal/review";
import { db } from "@/lib/db";
import type { DocumentCategory } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const companyId = String(form.get("companyId") || "");
    const periodId = String(form.get("periodId") || "");
    const category = String(form.get("category") || "OTHER") as DocumentCategory;
    const requestId = form.get("requestId") ? String(form.get("requestId")) : undefined;
    const clientNote = form.get("clientNote") ? String(form.get("clientNote")) : undefined;
    const file = form.get("file");

    if (!companyId || !periodId || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "companyId, periodId and file are required." }, { status: 422 });
    }

    const auth = await requireCompanyAccess(companyId);
    if (!auth.ok) return auth.error;

    const doc = await createUploadedDocument({
      companyId,
      periodId,
      category,
      file,
      uploadedByUserId: auth.session.user.id,
      requestId,
      clientNote
    });

    // Kick AI processing (non-blocking style but awaited for MVP feedback)
    let ai = null;
    try {
      ai = await runAiOnDocument(doc.id);
    } catch {
      await db.sourceDocument.update({
        where: { id: doc.id },
        data: { status: "IN_REVIEW" }
      });
    }

    return NextResponse.json({ ok: true, document: doc, ai }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
