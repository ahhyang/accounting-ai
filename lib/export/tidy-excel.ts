import * as XLSX from "xlsx";
import { categoryLabel } from "@/lib/ux/labels";

export type TidyExportDoc = {
  fileName: string | null;
  originalFileName: string | null;
  category: string;
  confidence: number | null;
  aiUsed?: boolean;
  fields: {
    merchant: string | null;
    supplier: string | null;
    customer: string | null;
    documentNumber: string | null;
    date: string | null;
    dueDate: string | null;
    subtotal: number | null;
    tax: number | null;
    total: number | null;
    currency: string | null;
    paymentMethod: string | null;
    lineItems?: unknown[];
    notes: string | null;
  } | null;
};

function partyName(doc: TidyExportDoc) {
  const f = doc.fields;
  if (!f) return "";
  if (doc.category === "SALES") {
    return f.customer || f.merchant || f.supplier || "";
  }
  return f.merchant || f.supplier || f.customer || "";
}

function lineItemsText(doc: TidyExportDoc) {
  const items = doc.fields?.lineItems;
  if (!Array.isArray(items) || !items.length) return "";
  return items
    .map((raw) => {
      const l = raw as {
        description?: string;
        quantity?: number;
        unitPrice?: number;
        amount?: number;
      };
      const qty = l.quantity != null ? ` x${l.quantity}` : "";
      const amt = l.amount != null ? ` = ${l.amount}` : "";
      return `${l.description ?? ""}${qty}${amt}`.trim();
    })
    .filter(Boolean)
    .join(" | ");
}

export function tidyDocsToExcelRows(docs: TidyExportDoc[]) {
  return docs.map((doc) => ({
    Category: categoryLabel(doc.category),
    "Tidied file name": doc.fileName ?? "",
    "Original file name": doc.originalFileName ?? "",
    Party: partyName(doc),
    "Document number": doc.fields?.documentNumber ?? "",
    Date: doc.fields?.date ?? "",
    "Due date": doc.fields?.dueDate ?? "",
    Subtotal: doc.fields?.subtotal ?? "",
    Tax: doc.fields?.tax ?? "",
    Total: doc.fields?.total ?? "",
    Currency: doc.fields?.currency ?? "MYR",
    "Payment method": doc.fields?.paymentMethod ?? "",
    "Line items": lineItemsText(doc),
    Notes: doc.fields?.notes ?? "",
    "AI %": doc.confidence != null ? Math.round(Number(doc.confidence)) : "",
    "AI source": doc.aiUsed ? "live" : "offline"
  }));
}

export function tidyDocsCategorySummary(docs: TidyExportDoc[]) {
  const map = new Map<string, { count: number; subtotal: number; tax: number; total: number }>();
  for (const doc of docs) {
    const key = doc.category;
    const row = map.get(key) ?? { count: 0, subtotal: 0, tax: 0, total: 0 };
    row.count += 1;
    row.subtotal += Number(doc.fields?.subtotal ?? 0);
    row.tax += Number(doc.fields?.tax ?? 0);
    row.total += Number(doc.fields?.total ?? 0);
    map.set(key, row);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, row]) => ({
      Category: categoryLabel(category),
      Documents: row.count,
      Subtotal: Math.round(row.subtotal * 100) / 100,
      Tax: Math.round(row.tax * 100) / 100,
      Total: Math.round(row.total * 100) / 100
    }));
}

/** Browser download of tidy upload results as .xlsx */
export function downloadTidyDocsExcel(docs: TidyExportDoc[], filename?: string) {
  const detail = tidyDocsToExcelRows(docs);
  const summary = tidyDocsCategorySummary(docs);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Documents");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, filename ?? `ai-finance-documents-${stamp}.xlsx`);
}
