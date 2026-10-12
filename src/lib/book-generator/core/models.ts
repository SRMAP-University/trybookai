/** Workers AI model ids and per-model request options (shared by app + worker). */

/**
 * Default writer for outlines, prose and the continuity ledger. Benchmarked on
 * real section prompts: hits the target length in one call at ~100 tok/s and
 * stays fast under concurrent load, with stronger prose than Llama 3.3 70B.
 * (DeepSeek V4 Flash wrote slightly better but queued for minutes under load.)
 */
export const CF_WRITER_MODEL = "@cf/nvidia/nemotron-3-120b-a12b";

/** Used when a writer call fails, so a capacity blip doesn't stall a book. */
export const CF_FALLBACK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Hybrid models that "think" before answering unless told not to. */
const HYBRID_REASONING = /deepseek-v4|nemotron-3|qwen3|glm-|kimi-k2/i;

/**
 * Extra Workers AI inputs for a model. Hybrid reasoning models otherwise spend
 * the whole token budget thinking and return no prose.
 */
export function workersAiOptions(cfModel: string): Record<string, unknown> {
  return HYBRID_REASONING.test(cfModel)
    ? { chat_template_kwargs: { enable_thinking: false } }
    : {};
}
