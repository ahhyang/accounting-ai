import {
  BOOKKEEPING_SYSTEM_PROMPT,
  extractionResultSchema,
  type ExtractionResult
} from "@/lib/ai/extraction";
import { callOpenRouter, callOpenRouterVision } from "@/lib/ai/openrouter";
import type { ResolvedFile } from "@/lib/portal/document-file";
import { isImageMime } from "@/lib/portal/document-file";

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeExtraction(raw: Record<string, unknown>): ExtractionResult | null {
  const parsed = extractionResultSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  if (raw.extracted && typeof raw.extracted === "object") {
    const fallback = extractionResultSchema.safeParse({
      extracted: raw.extracted,
      proposal: raw.proposal ?? { description: "Scanned document", lines: [] },
      riskFlags: raw.riskFlags ?? [],
      confidence: raw.confidence ?? 50
    });
    if (fallback.success) return fallback.data;
  }

  return null;
}

export async function extractFromScannedFile(input: {
  file: ResolvedFile;
  category: string;
  clientNote?: string;
  fileName?: string;
}): Promise<{ result: ExtractionResult; modelOutput: string }> {
  const userPrompt = `
Document category: ${input.category}
File name: ${input.fileName ?? input.file.fileName}
Client note: ${input.clientNote ?? "n/a"}
Task: Read this receipt/bill image carefully. Extract all fields from printed OR handwritten text.
If a field is missing, omit it or use null. Return valid JSON only.
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
      `${userPrompt}\n\nNote: PDF uploaded — extract from filename/context if image unavailable.`
    );
  }

  const parsed = safeParseJson(modelOutput);
  const normalized = parsed ? normalizeExtraction(parsed) : null;

  if (normalized) {
    return { result: normalized, modelOutput };
  }

  throw new Error("Could not parse AI extraction response.");
}

export function buildScanFallback(category: string, fileName: string): ExtractionResult {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  if (category === "SALES") {
    return {
      extracted: {
        customer: "Customer",
        date: today,
        dueDate: due,
        subtotal: 1000,
        tax: 0,
        total: 1000,
        currency: "MYR",
        textQuality: "unknown",
        notes: `Fallback from ${fileName}`
      },
      proposal: {
        description: `Sales from ${fileName}`,
        lines: [
          { accountCode: "1300", debit: 1000, credit: 0, memo: "AR" },
          { accountCode: "4100", debit: 0, credit: 1000, memo: "Sales" }
        ]
      },
      riskFlags: ["AI unavailable — review manually"],
      confidence: 45
    };
  }

  return {
    extracted: {
      merchant: "Supplier",
      supplier: "Supplier",
      date: today,
      dueDate: due,
      subtotal: 100,
      tax: 0,
      total: 100,
      currency: "MYR",
      textQuality: "unknown",
      notes: `Fallback from ${fileName}`
    },
    proposal: {
      description: `Expense from ${fileName}`,
      lines: [
        { accountCode: "5600", debit: 100, credit: 0, memo: "Expense" },
        { accountCode: "1200", debit: 0, credit: 100, memo: "Bank" }
      ]
    },
    riskFlags: ["AI unavailable — review manually"],
    confidence: 45
  };
}
