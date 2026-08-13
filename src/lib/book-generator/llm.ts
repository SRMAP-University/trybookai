import { runCloudflareAi, runCloudflareAiStream } from "@/lib/book-generator/cloudflare-ai";
import {
  DEFAULT_AI_MODEL,
  getModelConfig,
  normalizeModelId,
  type AiProvider,
} from "@/lib/ai-models";
import { cleanEnv } from "@/lib/env";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionOptions = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Request JSON output (best-effort on all providers). */
  json?: boolean;
  max_tokens?: number;
};

const THINK_TAG = "think";
const THINK_OPEN_TAGS = [
  "<" + THINK_TAG + ">",
  "<" + THINK_TAG,
  "<think>",
];
const THINK_CLOSE_TAGS = [
  "</" + THINK_TAG + ">",
  "</" + THINK_TAG,
  "</think>",
];

function tagPrefixAtEnd(text: string, tags: string[]): number | null {
  for (const tag of tags) {
    for (let i = 1; i < tag.length; i++) {
      const prefix = tag.slice(0, i);
      if (text.toLowerCase().endsWith(prefix.toLowerCase())) {
        return text.length - prefix.length;
      }
    }
  }
  return null;
}

function findEarliestTag(
  text: string,
  tags: string[]
): { index: number; length: number } | null {
  const lower = text.toLowerCase();
  let match: { index: number; length: number } | null = null;

  for (const tag of tags) {
    const index = lower.indexOf(tag.toLowerCase());
    if (index === -1) continue;
    if (!match || index < match.index) {
      match = { index, length: tag.length };
    }
  }

  return match;
}

/** Strip reasoning / chain-of-thought blocks from model output. */
export function extractModelText(text: string): string {
  let cleaned = text.trim();
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < THINK_OPEN_TAGS.length; i++) {
      const open = THINK_OPEN_TAGS[i];
      const close = THINK_CLOSE_TAGS[i] ?? THINK_CLOSE_TAGS[0];
      const pattern = new RegExp(
        `${open.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${close.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "gi"
      );
      const next = cleaned.replace(pattern, "").trim();
      if (next !== cleaned) {
        cleaned = next;
        changed = true;
      }
    }
  }

  cleaned = cleaned.replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/gi, "").trim();
  return cleaned;
}

/** Filters reasoning tokens out of a live stream. */
export function createThinkingStreamFilter() {
  let buffer = "";
  let insideThinking = false;
  let visible = "";

  return {
    push(chunk: string): string {
      buffer += chunk;
      let emitted = "";

      while (buffer.length > 0) {
        if (insideThinking) {
          const end = findEarliestTag(buffer, THINK_CLOSE_TAGS);
          if (!end) {
            const holdFrom = tagPrefixAtEnd(buffer, THINK_CLOSE_TAGS);
            if (holdFrom !== null) {
              break;
            }
            buffer = "";
            break;
          }
          buffer = buffer.slice(end.index + end.length);
          insideThinking = false;
          continue;
        }

        const start = findEarliestTag(buffer, THINK_OPEN_TAGS);
        if (!start) {
          const holdFrom = tagPrefixAtEnd(buffer, THINK_OPEN_TAGS);
          if (holdFrom !== null) {
            emitted += buffer.slice(0, holdFrom);
            buffer = buffer.slice(holdFrom);
            break;
          }
          emitted += buffer;
          buffer = "";
          break;
        }

        emitted += buffer.slice(0, start.index);
        buffer = buffer.slice(start.index + start.length);
        insideThinking = true;
      }

      visible += emitted;
      return emitted;
    },
    getVisible(): string {
      return visible;
    },
    flush(): string {
      if (insideThinking) {
        buffer = "";
        insideThinking = false;
        return "";
      }
      const rest = buffer;
      buffer = "";
      visible += rest;
      return rest;
    },
  };
}

export function extractJsonPayload(text: string): string {
  let cleaned = extractModelText(text);
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return cleaned;
}

function resolveProvider(modelId: string): {
  provider: AiProvider;
  runtimeModel: string;
} {
  const config = getModelConfig(normalizeModelId(modelId));
  if (config.provider === "groq" && config.groqModel) {
    return { provider: "groq", runtimeModel: config.groqModel };
  }
  return {
    provider: "cloudflare",
    runtimeModel:
      config.cfModel ?? getModelConfig(DEFAULT_AI_MODEL).cfModel ?? "",
  };
}

function defaultCloudflareRuntimeModel(): string {
  return getModelConfig(DEFAULT_AI_MODEL).cfModel ?? "";
}

async function runWithGroqFallback(
  runGroq: () => Promise<string>,
  runNormal: () => Promise<string>
): Promise<string> {
  try {
    const text = await runGroq();
    if (text.trim()) return text;
    throw new Error("empty response");
  } catch (error) {
    console.warn(
      "[llm] Super Fast failed; falling back to Normal:",
      error instanceof Error ? error.message : error
    );
    return runNormal();
  }
}

async function runGroqAi(
  model: string,
  options: {
    messages: ChatMessage[];
    temperature: number;
    max_tokens: number;
  }
): Promise<string> {
  const apiKey = cleanEnv(process.env.GROQ_API_KEY);
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
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
  return data.choices?.[0]?.message?.content ?? "";
}

async function runGroqAiStream(
  model: string,
  options: {
    messages: ChatMessage[];
    temperature: number;
    max_tokens: number;
    onToken: (token: string) => void;
  }
): Promise<string> {
  const apiKey = cleanEnv(process.env.GROQ_API_KEY);
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      stream: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Groq API error ${res.status}: ${body.slice(0, 300) || res.statusText}`
    );
  }
  if (!res.body) throw new Error("Groq API returned an empty stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const token = json.choices?.[0]?.delta?.content;
        if (token) {
          full += token;
          options.onToken(token);
        }
      } catch {
        /* ignore partial SSE JSON */
      }
    }
  }

  return full;
}

export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<string> {
  const { provider, runtimeModel } = resolveProvider(options.model);
  const temperature = options.temperature ?? 0.7;
  const max_tokens = options.max_tokens ?? 8192;

  const messages = options.json
    ? options.messages.map((m, i) =>
        i === 0
          ? {
              ...m,
              content: `${m.content}\n\nRespond with valid JSON only. No markdown fences or commentary.`,
            }
          : m
      )
    : options.messages;

  const raw =
    provider === "groq"
      ? await runWithGroqFallback(
          () => runGroqAi(runtimeModel, { messages, temperature, max_tokens }),
          () =>
            runCloudflareAi(defaultCloudflareRuntimeModel(), {
              messages,
              temperature,
              max_tokens,
            })
        )
      : await runCloudflareAi(runtimeModel, {
          messages,
          temperature,
          max_tokens,
        });
  // DeepSeek R1 and similar models may wrap answers in <think>…</think>.
  return extractModelText(raw);
}

export async function streamChatCompletion(
  options: ChatCompletionOptions & { onToken: (token: string) => void }
): Promise<string> {
  const { provider, runtimeModel } = resolveProvider(options.model);
  const temperature = options.temperature ?? 0.7;
  const max_tokens = options.max_tokens ?? 8192;
  const { onToken, ...rest } = options;

  const messages = rest.json
    ? rest.messages.map((m, i) =>
        i === 0
          ? {
              ...m,
              content: `${m.content}\n\nRespond with valid JSON only. No markdown fences or commentary.`,
            }
          : m
      )
    : rest.messages;

  const filter = createThinkingStreamFilter();
  const onVisible = (token: string) => {
    const visible = filter.push(token);
    if (visible) onToken(visible);
  };

  if (provider === "groq") {
    try {
      await runGroqAiStream(runtimeModel, {
        messages,
        temperature,
        max_tokens,
        onToken: onVisible,
      });
    } catch (error) {
      if (filter.getVisible().trim()) throw error;
      console.warn(
        "[llm] Super Fast stream failed; falling back to Normal:",
        error instanceof Error ? error.message : error
      );
      await runCloudflareAiStream(defaultCloudflareRuntimeModel(), {
        messages,
        temperature,
        max_tokens,
        onToken: onVisible,
      });
    }
  } else {
    await runCloudflareAiStream(runtimeModel, {
      messages,
      temperature,
      max_tokens,
      onToken: onVisible,
    });
  }
  const tail = filter.flush();
  if (tail) onToken(tail);
  return extractModelText(filter.getVisible());
}
