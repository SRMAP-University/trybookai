export type AiProvider = "cloudflare";

export type AiModelConfig = {
  value: string;
  label: string;
  description: string;
  plans: readonly ("FREE" | "PRO" | "ENTERPRISE")[];
  provider: AiProvider;
  /** Cloudflare Workers AI model id, e.g. @cf/deepseek-ai/... */
  cfModel: string;
};

export const AI_MODELS: readonly AiModelConfig[] = [
  {
    value: "deepseek-r1",
    label: "DeepSeek R1",
    description: "Cloudflare Workers AI — reasoning & long-form prose",
    plans: ["FREE", "PRO", "ENTERPRISE"],
    provider: "cloudflare",
    cfModel: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  },
  {
    value: "llama-3.3",
    label: "Llama 3.3 70B",
    description: "Cloudflare Workers AI — fast general writing",
    plans: ["FREE", "PRO", "ENTERPRISE"],
    provider: "cloudflare",
    cfModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  },
  {
    value: "qwen-32b",
    label: "Qwen2.5 32B",
    description: "Cloudflare Workers AI — strong instruction following",
    plans: ["PRO", "ENTERPRISE"],
    provider: "cloudflare",
    cfModel: "@cf/qwen/qwen2.5-32b-instruct",
  },
] as const;

export const DEFAULT_AI_MODEL = "deepseek-r1";

/** Legacy OpenAI model ids stored on older books/settings → Cloudflare default */
const LEGACY_MODEL_MAP: Record<string, string> = {
  "gpt-4o": "deepseek-r1",
  "gpt-4o-mini": "llama-3.3",
  openai: "deepseek-r1",
};

export function normalizeModelId(modelId: string): string {
  return LEGACY_MODEL_MAP[modelId] ?? modelId;
}

export function getModelConfig(modelId: string): AiModelConfig {
  const normalized = normalizeModelId(modelId);
  return (
    AI_MODELS.find((m) => m.value === normalized) ??
    AI_MODELS.find((m) => m.value === DEFAULT_AI_MODEL)!
  );
}

export function requiresProPlan(modelId: string): boolean {
  const config = getModelConfig(modelId);
  return !config.plans.includes("FREE");
}

export function isModelAvailable(modelId: string, plan: string): boolean {
  const config = getModelConfig(modelId);
  return config.plans.includes(plan as "FREE" | "PRO" | "ENTERPRISE");
}

export function modelsForPlan(plan: string): AiModelConfig[] {
  return AI_MODELS.filter((m) =>
    m.plans.includes(plan as "FREE" | "PRO" | "ENTERPRISE")
  );
}
