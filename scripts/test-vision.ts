import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BOOKKEEPING_SYSTEM_PROMPT } from "../lib/ai/extraction";
import { callOpenRouterVision } from "../lib/ai/openrouter";
import { safeParseJson } from "../lib/portal/scan-extract";

const file = process.argv[2] ?? "samples/01-grab-receipt.png";
const buf = readFileSync(resolve(process.cwd(), file));
const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;

async function main() {
  const started = Date.now();
  const out = await callOpenRouterVision(
    BOOKKEEPING_SYSTEM_PROMPT,
    'Read this receipt. Return ONE JSON object with "extracted" (merchant, date, subtotal, tax, total) and "confidence".',
    dataUrl,
    undefined,
    { maxTokens: 1200, reasoningEffort: "low" }
  );
  console.log(`elapsed=${Date.now() - started}ms`);
  const parsed = safeParseJson(out);
  if (!parsed) {
    console.log("NON-JSON OUTPUT:", out.slice(0, 400));
    process.exitCode = 1;
    return;
  }
  const extracted = (parsed.extracted ?? parsed) as Record<string, unknown>;
  console.log("merchant:", extracted.merchant ?? extracted.supplier ?? "(none)");
  console.log("date:", extracted.date ?? "(none)");
  console.log("total:", extracted.total ?? "(none)");
  console.log("confidence:", parsed.confidence ?? "(none)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
