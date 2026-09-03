import { z } from "zod";

export const lineItemSchema = z.object({
  description: z.string().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  amount: z.number().optional()
});

export const extractedBillSchema = z.object({
  merchant: z.string().optional(),
  supplier: z.string().optional(),
  customer: z.string().optional(),
  documentNumber: z.string().optional(),
  date: z.string().optional(),
  dueDate: z.string().optional(),
  subtotal: z.number().optional(),
  tax: z.number().optional(),
  total: z.number().optional(),
  paymentMethod: z.string().optional(),
  currency: z.string().optional(),
  categoryHint: z.string().optional(),
  textQuality: z.enum(["printed", "handwritten", "mixed", "unknown"]).optional(),
  lineItems: z.array(lineItemSchema).optional(),
  notes: z.string().optional()
});

export const extractionResultSchema = z.object({
  extracted: extractedBillSchema,
  proposal: z.object({
    description: z.string().optional(),
    lines: z.array(
      z.object({
        accountCode: z.string(),
        debit: z.number().optional(),
        credit: z.number().optional(),
        memo: z.string().optional()
      })
    )
  }),
  riskFlags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(100)
});

export type ExtractedBill = z.infer<typeof extractedBillSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const BOOKKEEPING_SYSTEM_PROMPT = `
You are an AI bookkeeping assistant for Malaysian SME accounting.
Analyze receipt/bill images — including printed text AND handwritten notes.
Read all visible amounts, dates, merchant names, invoice numbers, and line items.
Return JSON only (no markdown) with keys:
- extracted: {
    merchant, supplier, customer, documentNumber, date (YYYY-MM-DD),
    dueDate (YYYY-MM-DD), subtotal, tax, total, paymentMethod, currency,
    categoryHint, textQuality ("printed"|"handwritten"|"mixed"|"unknown"),
    lineItems: [{ description, quantity, unitPrice, amount }],
    notes
  }
- proposal: { description, lines: [{ accountCode, debit, credit, memo }] }
- riskFlags: string[]
- confidence: number 0-100
Use account codes: 1200 Bank, 1300 AR, 2100 AP, 4100 Sales, 5600 Office Expenses,
5400 Marketing, 5950 Input Tax, 2400 SST Payable.
For purchase receipts: Dr Expense + Input Tax, Cr Bank or AP.
For sales invoices: Dr AR, Cr Sales + SST Payable.
If handwriting is unclear, lower confidence and add riskFlags.
`.trim();
