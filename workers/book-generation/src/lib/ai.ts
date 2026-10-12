import {
  CF_FALLBACK_MODEL,
  CF_WRITER_MODEL,
  stripReasoning,
  workersAiOptions,
  type LlmResult,
} from "../../../../src/lib/book-generator/core";

/** Book.model → Workers AI id. Retired ids ("llama-3.3", gpt-4o) use the default writer. */
const CF_MODEL_MAP: Record<string, string> = {
  "nemotron-3-super": CF_WRITER_MODEL,
  "llama-3.3": CF_WRITER_MODEL,
  "deepseek-r1": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "qwen-32b": "@cf/qwen/qwen2.5-32b-instruct",
  "gpt-4o": CF_WRITER_MODEL,
  "gpt-4o-mini": CF_WRITER_MODEL,
};

const GROQ_MODEL_MAP: Record<string, string> = {
  "groq-llama-3.3": "llama-3.3-70b-versatile",
};

export const OUTLINE_CF_MODEL = CF_WRITER_MODEL;

export function isGroqBookModel(modelId: string | null | undefined): boolean {
  return Boolean(modelId && GROQ_MODEL_MAP[modelId]);
}

export function resolveCfModel(modelId: string | null | undefined): string {
  if (!modelId || isGroqBookModel(modelId)) return CF_WRITER_MODEL;
  return CF_MODEL_MAP[modelId] ?? CF_WRITER_MODEL;
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
  return stripReasoning(text)
    .replace(/^\s*thinking:[\s\S]*?(?=\n\n|\n[A-Z])/i, "")
    .trim();
}

/** finish_reason when the provider reports one, else a usage-based guess. */
function wasTruncated(result: unknown, maxTokens: number): boolean {
  const obj = (result ?? {}) as {
    finish_reason?: string;
    choices?: Array<{ finish_reason?: string }>;
    usage?: { completion_tokens?: number };
  };
  const reason = obj.choices?.[0]?.finish_reason ?? obj.finish_reason;
  if (reason) return reason === "length";
  const used = obj.usage?.completion_tokens;
  return typeof used === "number" && used >= maxTokens - 4;
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

type AiOptions = { max_tokens?: number; temperature?: number };

export async function runAiDetailed(
  ai: Ai,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: AiOptions = {}
): Promise<LlmResult> {
  const maxTokens = options.max_tokens ?? 4096;
  const result = await ai.run(model as Parameters<Ai["run"]>[0], {
    messages,
    max_tokens: maxTokens,
    temperature: options.temperature ?? 0.7,
    ...workersAiOptions(model),
  });
  return {
    model,
    text: stripThinking(extractText(result)),
    truncated: wasTruncated(result, maxTokens),
  };
}

/** Retry on the fallback model when a call fails or comes back empty. */
async function runAiWithFallback(
  ai: Ai,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: AiOptions
): Promise<LlmResult> {
  try {
    const result = await runAiDetailed(ai, model, messages, options);
    if (result.text.trim()) return result;
    throw new Error("empty response");
  } catch (error) {
    if (model === CF_FALLBACK_MODEL) throw error;
    console.warn(
      `[ai] ${model} failed; falling back to ${CF_FALLBACK_MODEL}:`,
      error instanceof Error ? error.message : error
    );
    return runAiDetailed(ai, CF_FALLBACK_MODEL, messages, options);
  }
}

export async function runAi(
  ai: Ai,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: AiOptions = {}
): Promise<string> {
  return (await runAiWithFallback(ai, model, messages, options)).text;
}

async function runGroqAi(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: AiOptions = {}
): Promise<LlmResult> {
  const maxTokens = options.max_tokens ?? 4096;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: options.temperature ?? 0.7,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Groq API error ${res.status}: ${body.slice(0, 300) || res.statusText}`
    );
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  return {
    model,
    text: stripThinking(data.choices?.[0]?.message?.content ?? ""),
    truncated: wasTruncated(data, maxTokens),
  };
}

type AiEnv = {
  AI: Ai;
  GROQ_API_KEY?: string;
};

/**
 * Run outline/prose with Super Fast when Book.model is a Groq id; otherwise Workers AI.
 * On Super Fast failure (or missing key), fall back to Normal (Workers AI).
 */
export async function runGenerationAiDetailed(
  env: AiEnv,
  bookModel: string | null | undefined,
  messages: Array<{ role: string; content: string }>,
  options: AiOptions = {},
  purpose: "outline" | "prose" = "prose"
): Promise<LlmResult> {
  const cfModel =
    purpose === "prose" ? resolveCfModel(bookModel) : OUTLINE_CF_MODEL;

  if (isGroqBookModel(bookModel)) {
    try {
      const key = env.GROQ_API_KEY?.trim();
      if (!key) {
        throw new Error("GROQ_API_KEY is not configured");
      }
      const result = await runGroqAi(
        key,
        GROQ_MODEL_MAP[bookModel!],
        messages,
        options
      );
      if (result.text.trim()) return result;
      throw new Error("empty response");
    } catch (error) {
      console.warn(
        "[ai] Super Fast failed; falling back to Normal:",
        error instanceof Error ? error.message : error
      );
      return runAiWithFallback(env.AI, CF_WRITER_MODEL, messages, options);
    }
  }

  return runAiWithFallback(env.AI, cfModel, messages, options);
}

export async function runGenerationAi(
  env: AiEnv,
  bookModel: string | null | undefined,
  messages: Array<{ role: string; content: string }>,
  options: AiOptions = {},
  purpose: "outline" | "prose" = "prose"
): Promise<string> {
  return (await runGenerationAiDetailed(env, bookModel, messages, options, purpose)).text;
}
