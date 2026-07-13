import { runCloudflareAi, runCloudflareAiStream } from "@/lib/book-generator/cloudflare-ai";
import {
  DEFAULT_AI_MODEL,
  getModelConfig,
  normalizeModelId,
  type AiProvider,
} from "@/lib/ai-models";

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
  return {
    provider: "cloudflare",
    runtimeModel: config.cfModel ?? getModelConfig(DEFAULT_AI_MODEL).cfModel,
  };
}

export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<string> {
  const { runtimeModel } = resolveProvider(options.model);
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

  return runCloudflareAi(runtimeModel, {
    messages,
    temperature,
    max_tokens,
  });
}

export async function streamChatCompletion(
  options: ChatCompletionOptions & { onToken: (token: string) => void }
): Promise<string> {
  const { runtimeModel } = resolveProvider(options.model);
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
  await runCloudflareAiStream(runtimeModel, {
    messages,
    temperature,
    max_tokens,
    onToken: (token) => {
      const visible = filter.push(token);
      if (visible) onToken(visible);
    },
  });
  const tail = filter.flush();
  if (tail) onToken(tail);
  return extractModelText(filter.getVisible());
}
