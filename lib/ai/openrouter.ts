type MessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

/** Strong text/reasoning model (classification, tax advisory). */
export const DEFAULT_TEXT_MODEL = "deepseek/deepseek-v4-pro";

/** Strong vision model for receipt/bill/invoice OCR (must support images). */
export const DEFAULT_VISION_MODEL = "deepseek/deepseek-v4.1-flash";

/** @deprecated kept for backwards compatibility — use DEFAULT_VISION_MODEL. */
export const DEFAULT_OPENROUTER_MODEL = DEFAULT_VISION_MODEL;

/** Tried in order when primary is rate-limited or unavailable. Must support images for OCR. */
const FALLBACK_MODELS = [
  "anthropic/claude-opus-4.8",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash"
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(status: number, body: string) {
  if (status === 429) return true;
  return /rate[- ]?limit|throttl|temporarily rate-limited/i.test(body);
}

function modelChain(primary: string) {
  const extras = (process.env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [primary, ...extras, ...FALLBACK_MODELS];
  return Array.from(new Set(chain));
}

async function callOnce(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: MessageContent
) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://accounting-ai-neon.vercel.app",
      "X-Title": "AI Finance OS"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    })
  });

  const text = await response.text();
  if (!response.ok) {
    const err = new Error(`OpenRouter error: ${response.status} ${text.slice(0, 400)}`);
    (err as Error & { status?: number; body?: string }).status = response.status;
    (err as Error & { status?: number; body?: string }).body = text;
    throw err;
  }

  try {
    const data = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new Error(`OpenRouter returned non-JSON: ${text.slice(0, 200)}`);
  }
}

async function callOpenRouterMessages(
  systemPrompt: string,
  userContent: MessageContent,
  primaryModel: string
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const models = modelChain(primaryModel);
  let lastError: Error | null = null;

  for (const candidate of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callOnce(apiKey, candidate, systemPrompt, userContent);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const status = (error as Error & { status?: number }).status;
        const body = (error as Error & { body?: string }).body ?? lastError.message;

        if (isRateLimited(status ?? 0, body)) {
          // Back off, then either retry same model or try next fallback.
          await sleep(1200 * (attempt + 1));
          if (attempt < 2) continue;
          break; // next model
        }

        // Non-rate-limit failure: try next model once, don't hammer retries.
        if (attempt === 0 && models.indexOf(candidate) < models.length - 1) {
          break;
        }
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("OpenRouter call failed.");
}

export async function callOpenRouter(systemPrompt: string, userPrompt: string) {
  const primary = process.env.OPENROUTER_MODEL ?? DEFAULT_TEXT_MODEL;
  return callOpenRouterMessages(systemPrompt, userPrompt, primary);
}

export async function callOpenRouterVision(
  systemPrompt: string,
  userPrompt: string,
  imageDataUrl: string,
  model?: string
) {
  const primary =
    model ?? process.env.OPENROUTER_VISION_MODEL ?? DEFAULT_VISION_MODEL;
  return callOpenRouterMessages(
    systemPrompt,
    [
      { type: "text", text: userPrompt },
      { type: "image_url", image_url: { url: imageDataUrl } }
    ],
    primary
  );
}
