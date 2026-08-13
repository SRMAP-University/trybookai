import { db } from "@/lib/db";

/** True when any section lacks real prose content. */
export async function hasIncompleteSections(bookId: string): Promise<boolean> {
  const empty = await db.section.count({
    where: {
      chapter: { bookId },
      OR: [{ content: null }, { wordCount: 0 }, { content: "" }],
    },
  });
  if (empty > 0) return true;

  // Also catch whitespace-only stubs that somehow got wordCount > 0 incorrectly.
  const thin = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM "Section" s
    INNER JOIN "Chapter" c ON c.id = s."chapterId"
    WHERE c."bookId" = ${bookId}
      AND LENGTH(TRIM(COALESCE(s.content, ''))) < 40
  `;
  return Number(thin[0]?.n ?? 0) > 0;
}
