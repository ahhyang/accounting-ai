import { db } from "@/lib/db";
import type { DocumentCategory, Prisma } from "@prisma/client";
import { callOpenRouter } from "@/lib/ai/openrouter";
import { writeAuditEvent } from "@/lib/audit/log";
import { round2 } from "@/lib/accounting/helpers";
import { getTrialBalance } from "@/lib/accounting/trial-balance";
import { runAiOnDocument, approveSuggestionAndPost } from "@/lib/portal/review";
import { categoryToSourceType } from "@/lib/portal/checklist";

const CATEGORIES: DocumentCategory[] = [
  "BANK",
  "SALES",
  "PURCHASE",
  "PAYROLL",
  "TAX",
  "OTHER"
];

export type TidyDocResult = {
  id: string;
  originalFileName: string | null;
  newFileName: string;
  category: DocumentCategory;
  previousCategory: DocumentCategory;
  merchant: string;
  date: string | null;
  total: number | null;
  confidence: number;
  renamed: boolean;
  recategorized: boolean;
  suggestionId?: string;
};

function sanitizeName(raw: string, max = 40): string {
  return raw
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, max) || "Unknown";
}

function fileExtension(fileName: string | null, mimeType: string | null): string {
  if (fileName && fileName.includes(".")) {
    return fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  }
  if (mimeType?.includes("pdf")) return ".pdf";
  if (mimeType?.includes("png")) return ".png";
  if (mimeType?.includes("jpeg") || mimeType?.includes("jpg")) return ".jpg";
  if (mimeType?.includes("webp")) return ".webp";
  if (mimeType?.includes("gif")) return ".gif";
  if (mimeType?.includes("csv")) return ".csv";
  if (mimeType?.includes("json")) return ".json";
  if (mimeType?.includes("spreadsheet") || mimeType?.includes("excel")) return ".xlsx";
  if (mimeType?.startsWith("text/")) return ".txt";
  return ".bin";
}

function readExtracted(
  extractedJson: unknown,
  category?: DocumentCategory
): {
  merchant: string;
  date: string | null;
  total: number | null;
  categoryHint?: string;
} {
  const root = (extractedJson ?? {}) as Record<string, unknown>;
  const extracted = (root.extracted ?? root) as Record<string, unknown>;
  const categoryHint = extracted.categoryHint
    ? String(extracted.categoryHint).toUpperCase()
    : undefined;
  const isSales =
    category === "SALES" || Boolean(categoryHint?.includes("SALES"));
  const merchant =
    String(
      isSales
        ? extracted.customer ?? extracted.merchant ?? extracted.supplier ?? "Unknown"
        : extracted.merchant ?? extracted.supplier ?? extracted.customer ?? "Unknown"
    ).trim() || "Unknown";
  const date = extracted.date ? String(extracted.date).slice(0, 10) : null;
  const totalRaw = extracted.total ?? extracted.subtotal;
  const total = totalRaw != null && totalRaw !== "" ? round2(Number(totalRaw)) : null;
  return { merchant, date, total, categoryHint };
}

function mapHintToCategory(hint: string | undefined, fallback: DocumentCategory): DocumentCategory {
  if (!hint) return fallback;
  if (hint.includes("BANK")) return "BANK";
  if (hint.includes("SALES") || hint.includes("INVOICE") || hint.includes("REVENUE")) return "SALES";
  if (hint.includes("PURCHASE") || hint.includes("EXPENSE") || hint.includes("RECEIPT") || hint.includes("SUPPLIER"))
    return "PURCHASE";
  if (hint.includes("PAYROLL") || hint.includes("SALARY")) return "PAYROLL";
  if (hint.includes("TAX") || hint.includes("SST")) return "TAX";
  return fallback;
}

/** Canonical name: YYYY-MM-DD_Merchant_RM123.45_PURCHASE.jpg */
export function buildCanonicalFileName(input: {
  fileName: string | null;
  mimeType: string | null;
  category: DocumentCategory;
  merchant: string;
  date: string | null;
  total: number | null;
}): string {
  const datePart = input.date ?? "undated";
  const merchantPart = sanitizeName(input.merchant);
  const amountPart =
    input.total != null && !Number.isNaN(input.total)
      ? `RM${input.total.toFixed(2)}`
      : "RMna";
  const ext = fileExtension(input.fileName, input.mimeType);
  return `${datePart}_${merchantPart}_${amountPart}_${input.category}${ext}`;
}

async function suggestCategoryWithAi(doc: {
  fileName: string | null;
  clientNote: string | null;
  category: DocumentCategory;
  extractedJson: unknown;
}): Promise<DocumentCategory> {
  const { categoryHint } = readExtracted(doc.extractedJson);
  const fromHint = mapHintToCategory(categoryHint, doc.category);
  if (categoryHint) return fromHint;

  try {
    const content = await callOpenRouter(
      `You classify Malaysian SME bookkeeping documents.
Return JSON only: { "category": "BANK"|"SALES"|"PURCHASE"|"PAYROLL"|"TAX"|"OTHER" }`,
      `File: ${doc.fileName ?? "unknown"}
Note: ${doc.clientNote ?? "n/a"}
Extracted: ${JSON.stringify(doc.extractedJson ?? {})}
Current category: ${doc.category}`
    );
    const cleaned = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { category?: string };
    const cat = String(parsed.category ?? "").toUpperCase() as DocumentCategory;
    if (CATEGORIES.includes(cat)) return cat;
  } catch {
    /* keep current */
  }
  return doc.category;
}

function formatExtractedCard(extractedJson: unknown) {
  const root = (extractedJson ?? {}) as Record<string, unknown>;
  const extracted = (root.extracted ?? root) as Record<string, unknown>;
  const lineItems = Array.isArray(extracted.lineItems)
    ? extracted.lineItems.map((raw) => {
        const l = raw as Record<string, unknown>;
        return {
          description: l.description != null ? String(l.description) : undefined,
          quantity: l.quantity != null ? Number(l.quantity) : undefined,
          unitPrice: l.unitPrice != null ? Number(l.unitPrice) : undefined,
          amount: l.amount != null ? Number(l.amount) : undefined
        };
      })
    : [];
  return {
    merchant: String(extracted.merchant ?? extracted.supplier ?? extracted.customer ?? "").trim() || null,
    supplier: extracted.supplier ? String(extracted.supplier) : null,
    customer: extracted.customer ? String(extracted.customer) : null,
    documentNumber: extracted.documentNumber ? String(extracted.documentNumber) : null,
    date: extracted.date ? String(extracted.date).slice(0, 10) : null,
    dueDate: extracted.dueDate ? String(extracted.dueDate).slice(0, 10) : null,
    subtotal: extracted.subtotal != null ? round2(Number(extracted.subtotal)) : null,
    tax: extracted.tax != null ? round2(Number(extracted.tax)) : null,
    total: extracted.total != null ? round2(Number(extracted.total)) : null,
    currency: extracted.currency ? String(extracted.currency) : "MYR",
    paymentMethod: extracted.paymentMethod ? String(extracted.paymentMethod) : null,
    lineItems,
    notes: extracted.notes ? String(extracted.notes) : null
  };
}

/**
 * After AI extraction on one upload/scan: rename + return structured card for client UI.
 */
export async function tidyOneDocument(
  documentId: string,
  options?: { forceClassify?: boolean }
) {
  const fresh = await db.sourceDocument.findUnique({ where: { id: documentId } });
  if (!fresh) throw new Error("Document not found.");

  const extractedEarly = readExtracted(fresh.extractedJson, fresh.category);
  const previousCategory = fresh.category;

  // Bulk client dumps start as OTHER — always classify from content/filename.
  let category: DocumentCategory = mapHintToCategory(
    extractedEarly.categoryHint,
    fresh.category
  );
  if (options?.forceClassify || fresh.category === "OTHER" || Boolean(extractedEarly.categoryHint)) {
    category = await suggestCategoryWithAi({
      fileName: fresh.fileName,
      clientNote: fresh.clientNote,
      category: fresh.category,
      extractedJson: fresh.extractedJson
    });
  }

  // Filename heuristics when AI keeps OTHER
  if (category === "OTHER" && fresh.fileName) {
    const n = fresh.fileName.toLowerCase();
    if (n.includes("bank") || n.includes("statement") || n.endsWith(".csv") || n.endsWith(".tsv"))
      category = "BANK";
    else if (n.includes("payroll") || n.includes("salary") || n.includes("payslip"))
      category = "PAYROLL";
    else if (n.includes("invoice") || n.includes("sales") || n.includes("register.xlsx"))
      category = n.includes("sales") ? "SALES" : category === "OTHER" ? "PURCHASE" : category;
    else if (n.includes("receipt") || n.includes("bill") || n.includes("grab") || n.includes("petrol") || n.endsWith(".json"))
      category = "PURCHASE";
    else if (n.includes("sst") || n.includes("tax") || n.includes("lhdn")) category = "TAX";
  }

  const extracted = readExtracted(fresh.extractedJson, category);

  const newFileName = buildCanonicalFileName({
    fileName: fresh.fileName,
    mimeType: fresh.mimeType,
    category,
    merchant: extracted.merchant,
    date: extracted.date,
    total: extracted.total
  });

  const tidyMeta = {
    originalFileName: fresh.fileName,
    tidyFileName: newFileName,
    tidiedAt: new Date().toISOString(),
    merchant: extracted.merchant,
    date: extracted.date,
    total: extracted.total
  };

  const prevJson =
    fresh.extractedJson && typeof fresh.extractedJson === "object"
      ? (fresh.extractedJson as Record<string, unknown>)
      : {};

  const updated = await db.sourceDocument.update({
    where: { id: fresh.id },
    data: {
      fileName: newFileName,
      category,
      type: categoryToSourceType(category),
      status: fresh.status === "UPLOADED" ? "IN_REVIEW" : fresh.status,
      documentDate: extracted.date ? new Date(extracted.date) : fresh.documentDate,
      extractedJson: {
        ...prevJson,
        tidy: tidyMeta
      } as Prisma.InputJsonValue
    }
  });

  return {
    id: updated.id,
    originalFileName: fresh.fileName,
    tidyFileName: newFileName,
    category,
    previousCategory,
    renamed: newFileName !== fresh.fileName,
    recategorized: category !== previousCategory,
    confidence: Number(updated.aiConfidence ?? 0),
    fields: formatExtractedCard(updated.extractedJson)
  };
}

/**
 * After client submits bills/receipts:
 * 1) ensure AI extraction
 * 2) group / re-categorize
 * 3) rename files to standard format
 * 4) count by category
 * 5) optionally auto-post high-confidence bookkeeping proposals
 */
export async function tidyCompanyDocuments(input: {
  companyId: string;
  periodId?: string;
  actorUserId: string;
  reRunAi?: boolean;
  autoPostReady?: boolean;
  minConfidenceToPost?: number;
}) {
  const minConf = input.minConfidenceToPost ?? 85;

  const docs = await db.sourceDocument.findMany({
    where: {
      companyId: input.companyId,
      ...(input.periodId ? { periodId: input.periodId } : {}),
      status: { in: ["UPLOADED", "AI_PROCESSED", "IN_REVIEW", "NEEDS_CLIENT"] }
    },
    include: {
      suggestions: { orderBy: { createdAt: "desc" }, take: 1 }
    },
    orderBy: { createdAt: "asc" }
  });

  const results: TidyDocResult[] = [];
  let postedCount = 0;
  const postedJournalIds: string[] = [];
  const postedDocIds = new Set<string>();

  for (const doc of docs) {
    let confidence = Number(doc.aiConfidence ?? 0);
    let suggestionId = doc.suggestions[0]?.id;

    const needsAi =
      input.reRunAi ||
      !doc.extractedJson ||
      confidence < 40 ||
      doc.status === "UPLOADED";

    if (needsAi) {
      try {
        const ai = await runAiOnDocument(doc.id);
        confidence = ai.confidence;
        suggestionId = ai.suggestion.id;
      } catch {
        /* continue with what we have */
      }
    }

    const fresh = await db.sourceDocument.findUnique({ where: { id: doc.id } });
    if (!fresh) continue;

    const extracted = readExtracted(fresh.extractedJson, fresh.category);
    const previousCategory = fresh.category;
    const category = await suggestCategoryWithAi({
      fileName: fresh.fileName,
      clientNote: fresh.clientNote,
      category: fresh.category,
      extractedJson: fresh.extractedJson
    });
    const named = readExtracted(fresh.extractedJson, category);
    const newFileName = buildCanonicalFileName({
      fileName: fresh.fileName,
      mimeType: fresh.mimeType,
      category,
      merchant: named.merchant,
      date: named.date,
      total: named.total
    });

    const renamed = newFileName !== fresh.fileName;
    const recategorized = category !== previousCategory;

    const tidyMeta = {
      originalFileName: fresh.fileName,
      tidyFileName: newFileName,
      tidiedAt: new Date().toISOString(),
      merchant: named.merchant,
      date: named.date,
      total: named.total
    };

    const prevJson =
      fresh.extractedJson && typeof fresh.extractedJson === "object"
        ? (fresh.extractedJson as Record<string, unknown>)
        : {};

    await db.sourceDocument.update({
      where: { id: fresh.id },
      data: {
        fileName: newFileName,
        category,
        type: categoryToSourceType(category),
        status: fresh.status === "UPLOADED" ? "IN_REVIEW" : fresh.status,
        documentDate: named.date ? new Date(named.date) : fresh.documentDate,
        extractedJson: {
          ...prevJson,
          tidy: tidyMeta
        } as Prisma.InputJsonValue
      }
    });

    results.push({
      id: fresh.id,
      originalFileName: fresh.fileName,
      newFileName,
      category,
      previousCategory,
      merchant: named.merchant,
      date: named.date,
      total: named.total,
      confidence,
      renamed,
      recategorized,
      suggestionId
    });

    if (input.autoPostReady && suggestionId && confidence >= minConf) {
      try {
        const journal = await approveSuggestionAndPost({
          suggestionId,
          actorUserId: input.actorUserId,
          description: `AI tidy post: ${newFileName}`
        });
        postedCount += 1;
        postedJournalIds.push(journal.id);
        postedDocIds.add(fresh.id);
      } catch {
        /* leave in review if unbalanced / locked */
      }
    }
  }

  const counts: Record<string, number> = {};
  for (const cat of CATEGORIES) counts[cat] = 0;
  for (const r of results) counts[r.category] = (counts[r.category] ?? 0) + 1;

  const totalsByCategory: Record<string, number> = {};
  for (const r of results) {
    if (r.total == null) continue;
    totalsByCategory[r.category] = round2((totalsByCategory[r.category] ?? 0) + r.total);
  }

  const tb = await getTrialBalance(input.companyId, { periodId: input.periodId });

  const summary = {
    documentCount: results.length,
    renamedCount: results.filter((r) => r.renamed).length,
    recategorizedCount: results.filter((r) => r.recategorized).length,
    counts,
    totalsByCategory,
    postedCount,
    postedJournalIds,
    readyToApprove: results.filter(
      (r) => r.confidence >= 70 && !postedDocIds.has(r.id)
    ).length,
    trialBalance: {
      balanced: tb.balanced,
      totalDebit: tb.totalDebit,
      totalCredit: tb.totalCredit
    }
  };

  await writeAuditEvent({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    entityType: "Company",
    entityId: input.companyId,
    action: "AI_TIDY_DOCUMENTS",
    afterJson: {
      periodId: input.periodId ?? null,
      summary,
      sample: results.slice(0, 20).map((r) => ({
        from: r.originalFileName,
        to: r.newFileName,
        category: r.category
      }))
    }
  });

  return { summary, documents: results };
}
