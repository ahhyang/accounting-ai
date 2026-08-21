import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  approveSuggestionAndPost,
  askClientForDocumentFix,
  runAiOnDocument
} from "@/lib/portal/review";
import { createAndPostJournal, PostingError } from "@/lib/accounting/posting";
import { getAccountByCode, nextDocNumber } from "@/lib/accounting/helpers";
import { writeAuditEvent } from "@/lib/audit/log";
import { isClientRole } from "@/lib/permissions/constants";

export async function GET(
  _request: Request,
  { params }: { params: { docId: string } }
) {
  const doc = await db.sourceDocument.findUnique({
    where: { id: params.docId },
    include: {
      company: true,
      period: true,
      suggestions: { orderBy: { createdAt: "desc" } },
      messages: { include: { sender: true }, orderBy: { createdAt: "asc" } }
    }
  });

  if (!doc) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const auth = await requireCompanyAccess(doc.companyId);
  if (!auth.ok) return auth.error;
  if (isClientRole(auth.session.user.roleName)) {
    return NextResponse.json({ ok: false, error: "Accountant only" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, document: doc });
}

const actionSchema = z.object({
  action: z.enum(["rerun_ai", "approve", "reject_ask_client", "manual_post"]),
  suggestionId: z.string().optional(),
  message: z.string().optional(),
  description: z.string().optional(),
  lines: z
    .array(
      z.object({
        accountCode: z.string(),
        debit: z.number().optional(),
        credit: z.number().optional(),
        memo: z.string().optional()
      })
    )
    .optional()
});

export async function POST(
  request: Request,
  { params }: { params: { docId: string } }
) {
  try {
    const doc = await db.sourceDocument.findUnique({ where: { id: params.docId } });
    if (!doc) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const access = await requireCompanyAccess(doc.companyId);
    if (!access.ok) return access.error;
    if (isClientRole(access.session.user.roleName)) {
      return NextResponse.json({ ok: false, error: "Accountant only" }, { status: 403 });
    }

    const body = actionSchema.parse(await request.json());

    if (body.action === "rerun_ai") {
      const ai = await runAiOnDocument(doc.id);
      return NextResponse.json({ ok: true, ai });
    }

    if (body.action === "reject_ask_client") {
      const msg = await askClientForDocumentFix({
        documentId: doc.id,
        accountantUserId: access.session.user.id,
        message: body.message || "Please re-upload a clearer document."
      });
      return NextResponse.json({ ok: true, message: msg });
    }

    if (body.action === "approve") {
      if (!body.suggestionId) {
        return NextResponse.json({ ok: false, error: "suggestionId required" }, { status: 422 });
      }
      const journal = await approveSuggestionAndPost({
        suggestionId: body.suggestionId,
        actorUserId: access.session.user.id,
        editedLines: body.lines,
        description: body.description
      });
      return NextResponse.json({ ok: true, journal });
    }

    if (body.action === "manual_post") {
      if (!body.lines || body.lines.length < 2) {
        return NextResponse.json({ ok: false, error: "Manual lines required" }, { status: 422 });
      }
      const lines = [];
      for (const line of body.lines) {
        const account = await getAccountByCode(doc.companyId, line.accountCode);
        lines.push({
          accountId: account.id,
          debit: line.debit ?? 0,
          credit: line.credit ?? 0,
          memo: line.memo
        });
      }
      const journalNumber = await nextDocNumber(doc.companyId, "JE", "journal");
      const journal = await createAndPostJournal({
        companyId: doc.companyId,
        journalDate: new Date().toISOString().slice(0, 10),
        journalNumber,
        description: body.description || `Manual entry for ${doc.fileName}`,
        sourceDocumentId: doc.id,
        lines
      });
      await db.sourceDocument.update({
        where: { id: doc.id },
        data: { status: "POSTED" }
      });
      await db.documentRequest.updateMany({
        where: { sourceDocumentId: doc.id },
        data: { status: "ACCEPTED" }
      });
      await writeAuditEvent({
        companyId: doc.companyId,
        actorUserId: access.session.user.id,
        entityType: "SourceDocument",
        entityId: doc.id,
        action: "MANUAL_POST",
        afterJson: { journalId: journal.id }
      });
      return NextResponse.json({ ok: true, journal });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof PostingError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : "Review failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
