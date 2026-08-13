const CF_MODEL_MAP: Record<string, string> = {
  "llama-3.3": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "deepseek-r1": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "qwen-32b": "@cf/qwen/qwen2.5-32b-instruct",
  "gpt-4o": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "gpt-4o-mini": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
};

const GROQ_MODEL_MAP: Record<string, string> = {
  "groq-llama-3.3": "llama-3.3-70b-versatile",
};

export const OUTLINE_CF_MODEL = CF_MODEL_MAP["llama-3.3"];

export function isGroqBookModel(modelId: string | null | undefined): boolean {
  return Boolean(modelId && GROQ_MODEL_MAP[modelId]);
}

export function resolveCfModel(modelId: string | null | undefined): string {
  if (!modelId) return CF_MODEL_MAP["llama-3.3"];
  if (isGroqBookModel(modelId)) return CF_MODEL_MAP["llama-3.3"];
  return CF_MODEL_MAP[modelId] ?? CF_MODEL_MAP["llama-3.3"];
}

export function extractText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result.trim();
  if (Array.isArray(result)) {
    return result.map(extractText).filter(Boolean).join("\n").trim();
  }
  if (typeof result !== "object") return String(result).trim();
  const obj = result as Record<string, unknown>;
  if (typeof obj.response === "string") return obj.response.trim();
  if (obj.response && typeof obj.response === "object") {
    const nested = extractText(obj.response);
    if (nested) return nested;
  }
  if (typeof obj.content === "string") return obj.content.trim();
  if (typeof obj.text === "string") return obj.text.trim();
  const choices = obj.choices as
    | Array<{ message?: { content?: unknown }; text?: unknown }>
    | undefined;
  if (Array.isArray(choices?.[0]?.message?.content)) {
    return (choices![0].message!.content as unknown[])
      .map((p) =>
        typeof p === "string"
          ? p
          : p && typeof p === "object" && "text" in p
            ? String((p as { text: unknown }).text)
            : ""
      )
      .join("")
      .trim();
  }
  if (typeof choices?.[0]?.message?.content === "string") {
    return (choices[0].message!.content as string).trim();
  }
  if (typeof choices?.[0]?.text === "string") {
    return (choices[0].text as string).trim();
  }
  return "";
}

/** Strip DeepSeek-style thinking blocks from model output. */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*thinking:[\s\S]*?(?=\n\n|\n[A-Z])/i, "")
    .trim();
}

export function extractJsonPayload(text: string): string {
  const cleaned = stripThinking(text);
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

export async function runAi(
  ai: Ai,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: { max_tokens?: number; temperature?: number } = {}
): Promise<string> {
  const result = await ai.run(model as Parameters<Ai["run"]>[0], {
    messages,
    max_tokens: options.max_tokens ?? 4096,
    temperature: options.temperature ?? 0.7,
  });
  return stripThinking(extractText(result));
}

async function runGroqAi(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: { max_tokens?: number; temperature?: number } = {}
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.7,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Groq API error ${res.status}: ${body.slice(0, 300) || res.statusText}`
    );
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return stripThinking(data.choices?.[0]?.message?.content ?? "");
}

type AiEnv = {
  AI: Ai;
  GROQ_API_KEY?: string;
};

/**
 * Run outline/prose against Groq when Book.model is a Groq id; otherwise Workers AI.
 * Extract/canon can keep calling runAi(ai, OUTLINE_CF_MODEL, ...) directly.
 */
export async function runGenerationAi(
  env: AiEnv,
  bookModel: string | null | undefined,
  messages: Array<{ role: string; content: string }>,
  options: { max_tokens?: number; temperature?: number } = {},
  purpose: "outline" | "prose" = "prose"
): Promise<string> {
  if (isGroqBookModel(bookModel)) {
    const key = env.GROQ_API_KEY?.trim();
    if (!key) {
      throw new Error("GROQ_API_KEY is not configured on the generation worker");
    }
    return runGroqAi(key, GROQ_MODEL_MAP[bookModel!], messages, options);
  }

  const cfModel =
    purpose === "prose" ? resolveCfModel(bookModel) : OUTLINE_CF_MODEL;
  return runAi(env.AI, cfModel, messages, options);
}
