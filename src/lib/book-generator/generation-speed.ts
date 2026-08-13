import { db } from "@/lib/db";
import {
  DEFAULT_AI_MODEL,
  isGroqModel,
  modelForGenerationSpeed,
  type GenerationSpeed,
} from "@/lib/ai-models";
import { isPaidPlan } from "@/lib/billing";

export function parseGenerationSpeed(value: unknown): GenerationSpeed | null {
  if (value === "normal" || value === "super_fast") return value;
  return null;
}

/** Persist Normal / Super Fast choice onto Book.model before enqueue. */
export async function applyGenerationSpeed(
  bookId: string,
  userId: string,
  speed: GenerationSpeed
) {
  const book = await db.book.findFirst({
    where: { id: bookId, userId },
    select: {
      model: true,
      user: { select: { plan: true } },
    },
  });
  if (!book) throw new Error("Book not found");

  if (speed === "super_fast" && !isPaidPlan(book.user.plan)) {
    throw new Error("Super Fast is available on Pro and higher plans.");
  }

  const model = modelForGenerationSpeed(speed, book.model);
  if (model === book.model) return { model };

  await db.book.update({
    where: { id: bookId },
    data: { model },
  });
  return { model };
}

/** Free users cannot keep a Groq model from a prior paid session / API spoof. */
export async function enforceGenerationSpeedForPlan(
  bookId: string,
  userId: string
) {
  const book = await db.book.findFirst({
    where: { id: bookId, userId },
    select: {
      model: true,
      user: { select: { plan: true } },
    },
  });
  if (!book) return;
  if (isPaidPlan(book.user.plan)) return;
  if (!isGroqModel(book.model)) return;

  await db.book.update({
    where: { id: bookId },
    data: { model: DEFAULT_AI_MODEL },
  });
}
