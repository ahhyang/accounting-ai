type MessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

async function callOpenRouterMessages(
  systemPrompt: string,
  userContent: MessageContent,
  model?: string
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const selectedModel =
    model ??
    process.env.OPENROUTER_VISION_MODEL ??
    process.env.OPENROUTER_MODEL ??
    "qwen/qwen2.5-vl-7b-instruct";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function callOpenRouter(systemPrompt: string, userPrompt: string) {
  return callOpenRouterMessages(systemPrompt, userPrompt);
}

export async function callOpenRouterVision(
  systemPrompt: string,
  userPrompt: string,
  imageDataUrl: string,
  model?: string
) {
  return callOpenRouterMessages(
    systemPrompt,
    [
      { type: "text", text: userPrompt },
      { type: "image_url", image_url: { url: imageDataUrl } }
    ],
    model ?? process.env.OPENROUTER_VISION_MODEL ?? "qwen/qwen2.5-vl-7b-instruct"
  );
}
