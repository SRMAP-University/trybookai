import { db } from "@/lib/db";
import {
  modelForGenerationSpeed,
  type GenerationSpeed,
} from "@/lib/ai-models";

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
    select: { model: true },
  });
  if (!book) throw new Error("Book not found");

  const model = modelForGenerationSpeed(speed, book.model);
  if (model === book.model) return { model };

  await db.book.update({
    where: { id: bookId },
    data: { model },
  });
  return { model };
}
