import { db } from "@/lib/db";
import { DEFAULT_AI_MODEL, isModelAvailable } from "@/lib/ai-models";
import { runBookGeneration } from "@/lib/book-generator/streaming";

const activeGenerations = new Map<string, Promise<void>>();

export async function validateGenerationEligibility(
  bookId: string,
  userId: string
) {
  const book = await db.book.findUniqueOrThrow({
    where: { id: bookId, userId },
    include: { user: true },
  });

  if (book.status === "COMPLETED") {
    return { book, canStart: false, reason: "completed" as const };
  }

  const remaining = book.user.pagesLimit - book.user.pagesUsed;
  if (book.targetPages > remaining) {
    throw new Error(
      `Insufficient page credits. You have ${remaining} pages remaining.`
    );
  }

  if (!isModelAvailable(book.model || DEFAULT_AI_MODEL, book.user.plan)) {
    throw new Error("This model requires a Pro or Enterprise plan.");
  }

  return { book, canStart: true, reason: null };
}

export function isGenerationActive(bookId: string) {
  return activeGenerations.has(bookId);
}

export async function ensureGenerationRunning(bookId: string, userId: string) {
  const existing = activeGenerations.get(bookId);
  if (existing) {
    return { started: false, alreadyRunning: true };
  }

  const { book, canStart } = await validateGenerationEligibility(
    bookId,
    userId
  );

  if (!canStart) {
    return { started: false, alreadyRunning: false, completed: true };
  }

  if (book.status === "FAILED") {
    await db.book.update({
      where: { id: bookId },
      data: { status: "DRAFT", errorMessage: null },
    });
  }

  const task = runBookGeneration(bookId, userId)
    .catch((error) => {
      console.error(`Background generation failed for book ${bookId}:`, error);
    })
    .finally(() => {
      activeGenerations.delete(bookId);
    });

  activeGenerations.set(bookId, task);
  return { started: true, alreadyRunning: false };
}
