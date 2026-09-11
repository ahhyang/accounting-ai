import { z } from "zod";

const num = z.preprocess((v) => {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number(String(v).replace(/,/g, "").replace(/RM/gi, "").trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}, z.number().optional());

const str = z.preprocess((v) => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}, z.string().optional());

export const lineItemSchema = z.object({
  description: str,
  quantity: num,
  unitPrice: num,
  amount: num
});

export const extractedBillSchema = z.object({
  merchant: str,
  supplier: str,
  customer: str,
  documentNumber: str,
  date: str,
  dueDate: str,
  subtotal: num,
  tax: num,
  total: num,
  paymentMethod: str,
  currency: str,
  categoryHint: str,
  textQuality: z
    .preprocess((v) => {
      const s = String(v ?? "unknown").toLowerCase();
      if (s === "printed" || s === "handwritten" || s === "mixed") return s;
      return "unknown";
    }, z.enum(["printed", "handwritten", "mixed", "unknown"]))
    .optional(),
  lineItems: z.array(lineItemSchema).optional(),
  notes: str
});

export const extractionResultSchema = z.object({
  extracted: extractedBillSchema,
  proposal: z
    .object({
      description: str,
      lines: z
        .array(
          z.object({
            accountCode: z.preprocess((v) => String(v ?? ""), z.string()),
            debit: num,
            credit: num,
            memo: str
          })
        )
        .optional()
        .default([])
    })
    .optional()
    .default({ description: "Scanned document", lines: [] }),
  riskFlags: z.array(z.string()).optional().default([]),
  confidence: z.preprocess((v) => {
    if (v == null || v === "") return 70;
    const n = Number(v);
    if (!Number.isFinite(n)) return 70;
    // Models sometimes return 0–1 probabilities instead of 0–100.
    const pct = n > 0 && n <= 1 ? n * 100 : n;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }, z.number().min(0).max(100))
});

export type ExtractedBill = z.infer<typeof extractedBillSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/** Fill missing money fields and lightly check subtotal + tax ≈ total. */
export function reconcileExtractedAmounts<T extends ExtractedBill>(extracted: T): T {
  const next = { ...extracted };
  const lineSum =
    next.lineItems?.reduce((s, l) => s + (typeof l.amount === "number" ? l.amount : 0), 0) ?? 0;

  if ((next.subtotal == null || next.subtotal === 0) && lineSum > 0) {
    next.subtotal = Math.round(lineSum * 100) / 100;
  }

  let subtotal = next.subtotal;
  let tax = next.tax;
  let total = next.total;

  if (subtotal != null && tax != null && total == null) {
    total = Math.round((subtotal + tax) * 100) / 100;
  } else if (total != null && subtotal != null && tax == null) {
    tax = Math.round((total - subtotal) * 100) / 100;
  } else if (total != null && tax != null && subtotal == null) {
    subtotal = Math.round((total - tax) * 100) / 100;
  } else if (total != null && subtotal == null && tax == null) {
    subtotal = total;
    tax = 0;
  }

  if (subtotal != null && tax != null && total != null) {
    const expected = Math.round((subtotal + tax) * 100) / 100;
    if (Math.abs(expected - total) <= 0.05) {
      total = expected;
    }
  }

  next.subtotal = subtotal;
  next.tax = tax;
  next.total = total;
  if (!next.currency) next.currency = "MYR";
  return next;
}

export const BOOKKEEPING_SYSTEM_PROMPT = `
You are an expert Malaysian SME bookkeeping OCR assistant.
Read the document image carefully (printed and handwritten). Do not invent amounts.
Accuracy rules:
1) Extract every line item you can see (description, qty, unit price, amount).
2) subtotal = sum before tax/SST. tax = SST or other tax. total = amount payable.
3) Check: subtotal + tax should equal total (within RM0.05). If the receipt shows TOTAL, use that exact figure.
4) Dates as YYYY-MM-DD. Currency MYR unless clearly otherwise.
5) For PURCHASE/receipts: merchant/supplier = shop name. For SALES invoices: customer = buyer; merchant can be seller.
6) categoryHint must be one of BANK|SALES|PURCHASE|PAYROLL|TAX|OTHER.
7) confidence is integer 0–100 (e.g. 92), never 0–1.
Return JSON only. No markdown fences. No commentary.
Required shape:
{
  "extracted": {
    "merchant": string,
    "supplier": string,
    "customer": string,
    "documentNumber": string,
    "date": "YYYY-MM-DD",
    "dueDate": "YYYY-MM-DD",
    "subtotal": number,
    "tax": number,
    "total": number,
    "paymentMethod": string,
    "currency": "MYR",
    "categoryHint": "BANK"|"SALES"|"PURCHASE"|"PAYROLL"|"TAX"|"OTHER",
    "textQuality": "printed"|"handwritten"|"mixed"|"unknown",
    "lineItems": [{ "description": string, "quantity": number, "unitPrice": number, "amount": number }],
    "notes": string
  },
  "proposal": {
    "description": string,
    "lines": [{ "accountCode": string, "debit": number, "credit": number, "memo": string }]
  },
  "riskFlags": string[],
  "confidence": number
}
Account codes: 1200 Bank, 1300 AR, 2100 AP, 4100 Sales, 5600 Office Expenses,
5400 Marketing, 5950 Input Tax, 2400 SST Payable.
Purchases: Dr Expense (+ Input Tax if SST), Cr Bank or AP.
Sales: Dr AR, Cr Sales (+ SST Payable if SST).
Numbers must be numeric JSON values (not strings).
`.trim();

