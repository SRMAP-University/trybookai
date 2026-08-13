export type AiProvider = "cloudflare" | "groq";

export type AiModelConfig = {
  value: string;
  label: string;
  description: string;
  plans: readonly ("FREE" | "PRO" | "ENTERPRISE" | "UNLIMITED")[];
  provider: AiProvider;
  /** Cloudflare Workers AI model id, e.g. @cf/deepseek-ai/... */
  cfModel?: string;
  /** Groq OpenAI-compatible model id */
  groqModel?: string;
};

type PlanGate = "FREE" | "PRO" | "ENTERPRISE" | "UNLIMITED";

export const AI_MODELS: readonly AiModelConfig[] = [
  {
    value: "llama-3.3",
    label: "Llama 3.3 70B",
    description: "Fast default — strong long-form writing (recommended)",
    plans: ["FREE", "PRO", "ENTERPRISE", "UNLIMITED"],
    provider: "cloudflare",
    cfModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  },
  {
    value: "groq-llama-3.3",
    label: "Super Fast (Groq)",
    description: "Highest speed via Groq Llama 3.3 — best for quick drafts",
    plans: ["PRO", "ENTERPRISE", "UNLIMITED"],
    provider: "groq",
    groqModel: "llama-3.3-70b-versatile",
  },
  {
    value: "deepseek-r1",
    label: "DeepSeek R1",
    description: "Slower — deep reasoning (higher quality, much longer waits)",
    plans: ["FREE", "PRO", "ENTERPRISE", "UNLIMITED"],
    provider: "cloudflare",
    cfModel: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  },
  {
    value: "qwen-32b",
    label: "Qwen2.5 32B",
    description: "Cloudflare Workers AI — strong instruction following",
    plans: ["PRO", "ENTERPRISE", "UNLIMITED"],
    provider: "cloudflare",
    cfModel: "@cf/qwen/qwen2.5-32b-instruct",
  },
] as const;

/** Fast non-reasoning model. R1 is opt-in — its think phase makes books very slow. */
export const DEFAULT_AI_MODEL = "llama-3.3";

/** Faster model for structured JSON outlines (avoid slow reasoning models). */
export const OUTLINE_AI_MODEL = "llama-3.3";

/** Book.model value when user picks Super Fast at generate time. */
export const SUPER_FAST_MODEL = "groq-llama-3.3";

export type GenerationSpeed = "normal" | "super_fast";

/** Legacy OpenAI model ids stored on older books/settings → Cloudflare default */
const LEGACY_MODEL_MAP: Record<string, string> = {
  "gpt-4o": "llama-3.3",
  "gpt-4o-mini": "llama-3.3",
  openai: "llama-3.3",
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

export function isGroqModel(modelId: string): boolean {
  return getModelConfig(modelId).provider === "groq";
}

/** Map Generate dialog choice → Book.model to persist before enqueue. */
export function modelForGenerationSpeed(
  speed: GenerationSpeed,
  currentModel?: string | null
): string {
  if (speed === "super_fast") return SUPER_FAST_MODEL;
  const current = currentModel
    ? normalizeModelId(currentModel)
    : DEFAULT_AI_MODEL;
  if (isGroqModel(current)) return DEFAULT_AI_MODEL;
  return current || DEFAULT_AI_MODEL;
}

export function requiresProPlan(modelId: string): boolean {
  const config = getModelConfig(modelId);
  return !config.plans.includes("FREE");
}

export function isModelAvailable(modelId: string, plan: string): boolean {
  const config = getModelConfig(modelId);
  return config.plans.includes(plan as PlanGate);
}

export function modelsForPlan(plan: string): AiModelConfig[] {
  return AI_MODELS.filter((m) => m.plans.includes(plan as PlanGate));
}
