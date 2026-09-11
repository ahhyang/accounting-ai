import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { callOpenRouter } from "@/lib/ai/openrouter";

const payloadSchema = z.object({
  companyContext: z.string().optional(),
  documentText: z.string().min(1),
  currency: z.string().default("MYR")
});

export async function POST(request: Request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.error;

    const json = await request.json();
    const payload = payloadSchema.parse(json);

    const systemPrompt = `
You are an AI bookkeeping assistant for Malaysian accounting workflows.
Extract structured receipt/invoice data and propose balanced double-entry journal lines.
Always return JSON with keys:
- extracted (merchant, date, total, tax, paymentMethod, items, supplier)
- proposal (description, lines[])
- riskFlags[]
- confidence (0-100)
No markdown.
`.trim();

    const userPrompt = `
Company context: ${payload.companyContext ?? "N/A"}
Currency: ${payload.currency}
Document text:
${payload.documentText}
`.trim();

    const content = await callOpenRouter(systemPrompt, userPrompt);

    return NextResponse.json({
      ok: true,
      modelOutput: content
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: error.issues }, { status: 422 });
    }

    const fallback = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ ok: false, error: fallback }, { status: 500 });
  }
}
