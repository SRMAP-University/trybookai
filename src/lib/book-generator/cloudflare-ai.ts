type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function extractChunkText(json: Record<string, unknown>): string {
  if (typeof json.response === "string") return json.response;
  if (typeof json.text === "string") return json.text;

  const choices = json.choices as
    | Array<{ delta?: { content?: string; reasoning_content?: string } }>
    | undefined;
  const delta = choices?.[0]?.delta;
  if (typeof delta?.content === "string") return delta.content;

  return "";
}

/** Normalize Workers AI result payloads across chat / text / reasoning models. */
export function extractCloudflareResponseText(result: unknown): string {
  if (result == null) return "";

  if (typeof result === "string") {
    return result.trim();
  }

  if (Array.isArray(result)) {
    return result
      .map((item) => extractCloudflareResponseText(item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (typeof result !== "object") {
    return String(result).trim();
  }

  const obj = result as Record<string, unknown>;

  // Common: { response: "..." }
  if (typeof obj.response === "string") {
    return obj.response.trim();
  }

  // DeepSeek / reasoning: { response: { content?: string, response?: string } }
  if (obj.response && typeof obj.response === "object") {
    const nested = extractCloudflareResponseText(obj.response);
    if (nested) return nested;
  }

  if (typeof obj.content === "string") {
    return obj.content.trim();
  }

  if (typeof obj.text === "string") {
    return obj.text.trim();
  }

  if (typeof obj.output === "string") {
    return obj.output.trim();
  }

  // OpenAI-compatible: { choices: [{ message: { content } }] }
  const choices = obj.choices as
    | Array<{ message?: { content?: unknown }; text?: unknown }>
    | undefined;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (typeof first.message?.content === "string") {
      return first.message.content.trim();
    }
    if (typeof first.text === "string") {
      return first.text.trim();
    }
    if (Array.isArray(first.message?.content)) {
      return (first.message.content as unknown[])
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && "text" in part) {
            return String((part as { text?: unknown }).text ?? "");
          }
          return "";
        })
        .join("")
        .trim();
    }
  }

  // Some models return { result: "..." } nested again
  if ("result" in obj) {
    return extractCloudflareResponseText(obj.result);
  }

  return "";
}

async function* parseSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
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
        const json = JSON.parse(payload) as Record<string, unknown>;
        const text = extractChunkText(json);
        if (text) yield text;
      } catch {
        if (payload) yield payload;
      }
    }
  }
}

export async function runCloudflareAiStream(
  model: string,
  options: {
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    onToken: (token: string) => void;
  }
): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set for Workers AI."
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 8192,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const err = await res.text();
    throw new Error(
      `Cloudflare Workers AI stream failed (${res.status}): ${err.slice(0, 200)}`
    );
  }

  let full = "";
  for await (const chunk of parseSseStream(res.body)) {
    if (!chunk) continue;
    full += chunk;
    options.onToken(chunk);
  }

  const text = full.trim();
  if (!text) {
    throw new Error("Cloudflare Workers AI returned an empty stream.");
  }
  return text;
}

type CloudflareAiResponse = {
  success?: boolean;
  result?: unknown;
  errors?: { message?: string }[];
};

export async function runCloudflareAi(
  model: string,
  options: {
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
  }
): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set for Workers AI."
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 8192,
    }),
  });

  const data = (await res.json()) as CloudflareAiResponse;

  if (!res.ok || !data.success) {
    const message =
      data.errors?.[0]?.message ??
      `Cloudflare Workers AI request failed (${res.status})`;
    throw new Error(message);
  }

  const text = extractCloudflareResponseText(data.result);
  if (!text) {
    throw new Error(
      `Cloudflare Workers AI returned an empty response. Result type: ${typeof data.result}`
    );
  }

  return text;
}
