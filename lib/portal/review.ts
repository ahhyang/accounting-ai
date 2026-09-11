import { db } from "@/lib/db";
import { callOpenRouter } from "@/lib/ai/openrouter";
import { BOOKKEEPING_SYSTEM_PROMPT } from "@/lib/ai/extraction";
import { createAndPostJournal, PostingError } from "@/lib/accounting/posting";
import { getAccountByCode, nextDocNumber, round2 } from "@/lib/accounting/helpers";
import { writeAuditEvent } from "@/lib/audit/log";
import { resolveDocumentFile, isScannableMime, isImageMime, isPdfMime } from "@/lib/portal/document-file";
import { buildScanFallback, extractFromScannedFile } from "@/lib/portal/scan-extract";
import { canReadFileContents } from "@/lib/portal/structured-extract";

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function runAiOnDocument(documentId: string) {
  const doc = await db.sourceDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Document not found.");

  let parsed: Record<string, unknown> | null = null;
  let modelOutput = "";
  let confidence = 55;
  let aiUsed = false;
  let aiError: string | null = null;

  const resolvedFile = await resolveDocumentFile(doc);
  const canExtract =
    resolvedFile &&
    (isScannableMime(resolvedFile.mimeType) ||
      canReadFileContents(resolvedFile.mimeType, resolvedFile.fileName) ||
      isImageMime(resolvedFile.mimeType) ||
      isPdfMime(resolvedFile.mimeType));

  if (resolvedFile && canExtract) {
    try {
      const { result, modelOutput: output } = await extractFromScannedFile({
        file: resolvedFile,
        category: doc.category,
        clientNote: doc.clientNote ?? undefined,
        fileName: doc.fileName ?? undefined
      });
      parsed = result as unknown as Record<string, unknown>;
      modelOutput = output;
      confidence = result.confidence;
      aiUsed = true;
    } catch (error) {
      aiError = error instanceof Error ? error.message : "Vision extract failed";
      parsed = buildScanFallback(doc.category, doc.fileName ?? "document", aiError) as unknown as Record<
        string,
        unknown
      >;
      confidence = Number(parsed.confidence ?? 45);
      modelOutput = JSON.stringify(parsed);
    }
  } else {
    const userPrompt = `
Document category: ${doc.category}
File name: ${doc.fileName ?? "unknown"}
Client note: ${doc.clientNote ?? "n/a"}
Existing extracted: ${JSON.stringify(doc.extractedJson ?? {})}
Extract what you can from the filename and note. Return valid JSON only.
If details unknown, omit fields and set confidence below 60 — do not invent fake merchants or amounts.
`.trim();

    try {
      modelOutput = await callOpenRouter(BOOKKEEPING_SYSTEM_PROMPT, userPrompt);
      parsed = safeParseJson(modelOutput);
      if (parsed?.confidence != null) confidence = Number(parsed.confidence);
      aiUsed = Boolean(parsed);
      if (!parsed) {
        aiError = "AI returned non-JSON response";
        parsed = buildFallbackProposal(doc.category, doc.fileName ?? "document", aiError);
        confidence = 45;
      }
    } catch (error) {
      aiError = error instanceof Error ? error.message : "OpenRouter call failed";
      parsed = buildFallbackProposal(doc.category, doc.fileName ?? "document", aiError);
      confidence = Number(parsed.confidence ?? 45);
      modelOutput = JSON.stringify(parsed);
    }
  }

  if (!parsed) {
    aiError = aiError ?? "No AI extraction result";
    parsed = buildFallbackProposal(doc.category, doc.fileName ?? "document", aiError);
    confidence = 45;
  }

  const suggestion = await db.aiSuggestion.create({
    data: {
      companyId: doc.companyId,
      sourceDocumentId: doc.id,
      type: "BOOKKEEPING_PROPOSAL",
      status: "PROPOSED",
      confidence,
      payload: {
        modelOutput,
        aiUsed,
        aiError,
        ...(parsed as object)
      }
    }
  });

  await db.sourceDocument.update({
    where: { id: doc.id },
    data: {
      status: "IN_REVIEW",
      aiConfidence: confidence,
      extractedJson: {
        ...(parsed as object),
        aiMeta: { aiUsed, aiError }
      }
    }
  });

  return { suggestion, confidence, parsed, aiUsed, aiError };
}

function buildFallbackProposal(category: string, fileName: string, aiError?: string) {
  return buildScanFallback(category, fileName, aiError) as unknown as Record<string, unknown>;
}

export async function approveSuggestionAndPost(input: {
  suggestionId: string;
  actorUserId: string;
  editedLines?: Array<{ accountCode: string; debit?: number; credit?: number; memo?: string }>;
  description?: string;
}) {
  const suggestion = await db.aiSuggestion.findUnique({
    where: { id: input.suggestionId },
    include: { sourceDocument: true }
  });

  if (!suggestion || !suggestion.sourceDocument) {
    throw new PostingError("Suggestion or source document missing.");
  }

  const payload = suggestion.payload as {
    proposal?: {
      description?: string;
      lines?: Array<{ accountCode: string; debit?: number; credit?: number; memo?: string }>;
    };
  };

  const rawLines = input.editedLines ?? payload.proposal?.lines ?? [];
  if (rawLines.length < 2) throw new PostingError("Need at least two journal lines.");

  const lines = [];
  for (const line of rawLines) {
    const account = await getAccountByCode(suggestion.companyId, line.accountCode);
    lines.push({
      accountId: account.id,
      debit: round2(line.debit ?? 0),
      credit: round2(line.credit ?? 0),
      memo: line.memo
    });
  }

  const journalNumber = await nextDocNumber(suggestion.companyId, "JE", "journal");
  const journalDate =
    suggestion.sourceDocument.documentDate?.toISOString().slice(0, 10) ??
    new Date().toISOString().slice(0, 10);

  const journal = await createAndPostJournal({
    companyId: suggestion.companyId,
    journalDate,
    journalNumber,
    description: input.description ?? payload.proposal?.description ?? "AI approved entry",
    sourceDocumentId: suggestion.sourceDocumentId ?? undefined,
    lines
  });

  await db.aiSuggestion.update({
    where: { id: suggestion.id },
    data: { status: "APPROVED" }
  });

  await db.sourceDocument.update({
    where: { id: suggestion.sourceDocument.id },
    data: { status: "POSTED" }
  });

  if (suggestion.sourceDocumentId) {
    const req = await db.documentRequest.findFirst({
      where: { sourceDocumentId: suggestion.sourceDocumentId }
    });
    if (req) {
      await db.documentRequest.update({
        where: { id: req.id },
        data: { status: "ACCEPTED" }
      });
    }
  }

  await writeAuditEvent({
    companyId: suggestion.companyId,
    actorUserId: input.actorUserId,
    entityType: "AiSuggestion",
    entityId: suggestion.id,
    action: "APPROVE_AND_POST",
    afterJson: { journalId: journal.id, journalNumber: journal.journalNumber }
  });

  return journal;
}

export async function askClientForDocumentFix(input: {
  documentId: string;
  accountantUserId: string;
  message: string;
}) {
  const doc = await db.sourceDocument.update({
    where: { id: input.documentId },
    data: { status: "NEEDS_CLIENT" }
  });

  await db.clientMessage.create({
    data: {
      companyId: doc.companyId,
      sourceDocumentId: doc.id,
      senderUserId: input.accountantUserId,
      body: input.message,
      isFromAccountant: true
    }
  });

  await writeAuditEvent({
    companyId: doc.companyId,
    actorUserId: input.accountantUserId,
    entityType: "SourceDocument",
    entityId: doc.id,
    action: "ASK_CLIENT_FIX",
    afterJson: { message: input.message }
  });

  return doc;
}
