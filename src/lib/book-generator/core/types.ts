/** Provider-agnostic LLM call contract; each runtime supplies its own implementation. */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmPurpose = "outline" | "prose" | "utility";

export type LlmCallOptions = {
  max_tokens: number;
  temperature: number;
  purpose: LlmPurpose;
};

export type LlmResult = {
  text: string;
  /** Provider reported a max-token stop. False when the provider doesn't say. */
  truncated: boolean;
  /** Model that actually answered (differs from the requested one after a fallback). */
  model?: string;
};

export type LlmCall = (
  messages: ChatMessage[],
  options: LlmCallOptions
) => Promise<LlmResult>;
