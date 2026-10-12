import { db } from "@/lib/db";
import { BOOK_TEMPLATES } from "@/lib/constants";

export type TemplateCover = {
  title: string;
  coverImage: string;
};

/**
 * The most recent public cover in each template's genre, keyed by template id,
 * so "Start from" cards can show a real book of that kind. Public books only:
 * these covers are shown to every signed-in author. Templates whose genre has
 * no public cover yet are left out and fall back to placeholder art.
 */
export async function getTemplateCovers(): Promise<Record<string, TemplateCover>> {
  try {
    const entries = await Promise.all(
      BOOK_TEMPLATES.map(async (template) => {
        const book = await db.book.findFirst({
          where: {
            isPublic: true,
            coverImage: { not: null },
            genre: { equals: template.genre, mode: "insensitive" },
          },
          orderBy: { updatedAt: "desc" },
          select: { title: true, coverImage: true },
        });
        return book?.coverImage
          ? ([template.id, { title: book.title, coverImage: book.coverImage }] as const)
          : null;
      })
    );
    return Object.fromEntries(entries.filter((entry) => entry !== null));
  } catch (error) {
    console.error("[template-covers] lookup failed", error);
    return {};
  }
}
