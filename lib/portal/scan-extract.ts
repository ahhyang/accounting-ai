import {
  BOOKKEEPING_SYSTEM_PROMPT,
  extractionResultSchema,
  reconcileExtractedAmounts,
  type ExtractionResult
} from "@/lib/ai/extraction";
import { callOpenRouter, callOpenRouterVision } from "@/lib/ai/openrouter";
import type { ResolvedFile } from "@/lib/portal/document-file";
import { isImageMime } from "@/lib/portal/document-file";
import {
  canReadFileContents,
  extractFromStructuredFile,
  fileBytesToText
} from "@/lib/portal/structured-extract";

/** Pull the first JSON object from model text (handles ```json fences and prose). */
export function safeParseJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    /* continue */
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function looksLikeBillFields(raw: Record<string, unknown>) {
  return (
    raw.merchant != null ||
    raw.supplier != null ||
    raw.customer != null ||
    raw.total != null ||
    raw.subtotal != null ||
    raw.documentNumber != null ||
    raw.date != null
  );
}

function defaultProposal(category: string, extracted: Record<string, unknown>): ExtractionResult["proposal"] {
  const total = Number(extracted.total ?? extracted.subtotal ?? 0) || 0;
  const merchant = String(extracted.merchant ?? extracted.supplier ?? extracted.customer ?? "Document");
  if (category === "SALES" || String(extracted.categoryHint ?? "").toUpperCase().includes("SALES")) {
    return {
      description: `Sales — ${merchant}`,
      lines: [
        { accountCode: "1300", debit: total, credit: 0, memo: "AR" },
        { accountCode: "4100", debit: 0, credit: total, memo: "Sales" }
      ]
    };
  }
  return {
    description: `Expense — ${merchant}`,
    lines: [
      { accountCode: "5600", debit: total, credit: 0, memo: "Expense" },
      { accountCode: "1200", debit: 0, credit: total, memo: "Bank" }
    ]
  };
}

export function normalizeExtraction(
  raw: Record<string, unknown>,
  category = "OTHER"
): ExtractionResult | null {
  const direct = extractionResultSchema.safeParse(raw);
  if (direct.success) {
    return {
      ...direct.data,
      extracted: reconcileExtractedAmounts(direct.data.extracted)
    };
  }

  // { extracted: {...}, ...partial }
  if (raw.extracted && typeof raw.extracted === "object") {
    const wrapped = extractionResultSchema.safeParse({
      extracted: raw.extracted,
      proposal: raw.proposal ?? defaultProposal(category, raw.extracted as Record<string, unknown>),
      riskFlags: raw.riskFlags ?? [],
      confidence: raw.confidence ?? 70
    });
    if (wrapped.success) {
      return {
        ...wrapped.data,
        extracted: reconcileExtractedAmounts(wrapped.data.extracted)
      };
    }
  }

  // Flat bill fields from vision model
  if (looksLikeBillFields(raw)) {
    const flat = extractionResultSchema.safeParse({
      extracted: raw,
      proposal: defaultProposal(category, raw),
      riskFlags: ["Normalized from flat AI JSON"],
      confidence: raw.confidence ?? 72
    });
    if (flat.success) {
      return {
        ...flat.data,
        extracted: reconcileExtractedAmounts(flat.data.extracted)
      };
    }
  }

  return null;
}

export async function extractFromScannedFile(input: {
  file: ResolvedFile;
  category: string;
  clientNote?: string;
  fileName?: string;
}): Promise<{ result: ExtractionResult; modelOutput: string }> {
  const fileName = input.fileName ?? input.file.fileName;

  // CSV / JSON / XLSX / TXT / HTML — read real file bytes first (not filename-only).
  if (canReadFileContents(input.file.mimeType, fileName)) {
    const local = extractFromStructuredFile({
      file: input.file,
      category: input.category,
      fileName
    });
    if (local) {
      return {
        result: local.result,
        modelOutput: JSON.stringify({
          source: local.source,
          extracted: local.result.extracted,
          confidence: local.result.confidence
        })
      };
    }

    // Fallback: send file text to the LLM
    const text = fileBytesToText(input.file);
    if (text) {
      const userPrompt = `
Document category: ${input.category}
File name: ${fileName}
Client note: ${input.clientNote ?? "n/a"}
Task: The file contents are below (CSV/JSON/XLSX/text). Extract merchant/bank, dates, totals, and line items.
For bank statements: date = last txn date, merchant = bank name, total = closing balance if present else sum of absolute amounts.
Return ONE JSON object only.
--- FILE CONTENTS ---
${text.slice(0, 12000)}
`.trim();
      const modelOutput = await callOpenRouter(BOOKKEEPING_SYSTEM_PROMPT, userPrompt);
      const parsed = safeParseJson(modelOutput);
      const normalized = parsed ? normalizeExtraction(parsed, input.category) : null;
      if (normalized) return { result: normalized, modelOutput };
      const preview = modelOutput.replace(/\s+/g, " ").slice(0, 160);
      throw new Error(
        `Could not parse AI extraction response.${preview ? ` Got: ${preview}` : ""}`
      );
    }
  }

  const userPrompt = `
Document category: ${input.category}
File name: ${fileName}
Client note: ${input.clientNote ?? "n/a"}
Task: Read this receipt/bill image carefully. Extract ALL money figures and line items.
Double-check: subtotal + tax ≈ total. Use exact TOTAL printed on the document.
Return ONE JSON object only (no markdown). Prefer full schema with "extracted", "proposal", "confidence".
Include lineItems whenever possible. For sales invoices put the buyer in customer.
`.trim();

  let modelOutput = "";

  if (isImageMime(input.file.mimeType)) {
    modelOutput = await callOpenRouterVision(
      BOOKKEEPING_SYSTEM_PROMPT,
      userPrompt,
      input.file.dataUrl
    );
  } else {
    modelOutput = await callOpenRouter(
      BOOKKEEPING_SYSTEM_PROMPT,
      `${userPrompt}\n\nNote: PDF/file uploaded — extract from filename/context if image unavailable.`
    );
  }

  const parsed = safeParseJson(modelOutput);
  const normalized = parsed ? normalizeExtraction(parsed, input.category) : null;

  if (normalized) {
    return { result: normalized, modelOutput };
  }

  const preview = modelOutput.replace(/\s+/g, " ").slice(0, 160);
  throw new Error(
    `Could not parse AI extraction response.${preview ? ` Got: ${preview}` : ""}`
  );
}

export function buildScanFallback(
  category: string,
  fileName: string,
  aiError?: string
): ExtractionResult {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const riskFlags = [
    "AI unavailable — review manually",
    ...(aiError ? [`AI error: ${aiError.slice(0, 180)}`] : [])
  ];

  if (category === "SALES") {
    return {
      extracted: {
        customer: "Unknown",
        date: today,
        dueDate: due,
        currency: "MYR",
        textQuality: "unknown",
        notes: aiError ? `Offline fallback: ${aiError.slice(0, 160)}` : `Fallback from ${fileName}`
      },
      proposal: {
        description: `Sales from ${fileName}`,
        lines: [
          { accountCode: "1300", debit: 0, credit: 0, memo: "AR — fill amount" },
          { accountCode: "4100", debit: 0, credit: 0, memo: "Sales — fill amount" }
        ]
      },
      riskFlags,
      confidence: 45
    };
  }

  return {
    extracted: {
      merchant: "Unknown",
      supplier: "Unknown",
      date: today,
      dueDate: due,
      currency: "MYR",
      textQuality: "unknown",
      notes: aiError ? `Offline fallback: ${aiError.slice(0, 160)}` : `Fallback from ${fileName}`
    },
    proposal: {
      description: `Expense from ${fileName}`,
      lines: [
        { accountCode: "5600", debit: 0, credit: 0, memo: "Expense — fill amount" },
        { accountCode: "1200", debit: 0, credit: 0, memo: "Bank — fill amount" }
      ]
    },
    riskFlags,
    confidence: 45
  };
}
