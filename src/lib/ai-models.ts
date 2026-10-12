import { CF_WRITER_MODEL } from "@/lib/book-generator/core/models";

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
    value: "nemotron-3-super",
    label: "Nemotron 3 Super 120B",
    description: "Fast default — in-depth, book-quality writing (recommended)",
    plans: ["FREE", "PRO", "ENTERPRISE", "UNLIMITED"],
    provider: "cloudflare",
    cfModel: CF_WRITER_MODEL,
  },
  {
    value: "groq-llama-3.3",
    label: "Super Fast",
    description: "Highest speed — best for quick drafts",
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
    description: "Strong instruction following",
    plans: ["PRO", "ENTERPRISE", "UNLIMITED"],
    provider: "cloudflare",
    cfModel: "@cf/qwen/qwen2.5-32b-instruct",
  },
] as const;

/** Fast writer (reasoning off). R1 is opt-in — its think phase makes books very slow. */
export const DEFAULT_AI_MODEL = "nemotron-3-super";

/** Model for structured JSON outlines and the continuity ledger. */
export const OUTLINE_AI_MODEL = "nemotron-3-super";

/** Book.model value when user picks Super Fast at generate time. */
export const SUPER_FAST_MODEL = "groq-llama-3.3";

export type GenerationSpeed = "normal" | "super_fast";

/**
 * Retired model ids stored on older books/settings → current default.
 * "llama-3.3" is also the Book.model column default, so new rows land here too.
 */
const LEGACY_MODEL_MAP: Record<string, string> = {
  "llama-3.3": DEFAULT_AI_MODEL,
  "gpt-4o": DEFAULT_AI_MODEL,
  "gpt-4o-mini": DEFAULT_AI_MODEL,
  openai: DEFAULT_AI_MODEL,
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
