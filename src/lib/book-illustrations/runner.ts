import type { ScoreMood } from "@/lib/audio-generator/score-types";
import { db } from "@/lib/db";
import { isNarrativeBook } from "@/lib/book-generator/core/format";
import { runFluxImage } from "@/lib/image-gen";
import { uploadIllustrationToR2 } from "@/lib/r2";
import { figureLine, insertFigureAfterParagraph } from "@/lib/book-illustrations/place";
import { planChapterIllustrations } from "@/lib/book-illustrations/plan";
import { ILLUSTRATION_SIZE, illustrationStyleFor } from "@/lib/book-illustrations/style";
import { buildVisualBible, parseVisualBible, type VisualBible } from "@/lib/reel-generator/cast";
import {
  BOOK_FRAME_RULES,
  REEL_NEGATIVE_PROMPT,
  buildSafeShotPrompt,
  buildShotPrompt,
} from "@/lib/reel-generator/images";
import { loadReelBook } from "@/lib/reel-generator/script";

/** A running job refreshes its heartbeat this often; past ILLUSTRATION_STALE_MS it's presumed dead. */
const HEARTBEAT_MS = 15_000;
export const ILLUSTRATION_STALE_MS = 60_000;

const IMAGE_CONCURRENCY = 4;
const PLAN_CONCURRENCY = 3;
const MAX_ATTEMPTS = 2;
/** Upper bound per book, so a 60-chapter book doesn't draw hundreds of pictures. */
export const MAX_PICTURES_PER_BOOK = 60;

/** Stop starting new work after this, leaving time to place and save before the function limit. */
const RUN_BUDGET_MS = process.env.VERCEL ? 240_000 : 30 * 60_000;

type IllustrationBook = {
  id: string;
  title: string;
  genre: string | null;
  tone: string | null;
  language: string | null;
  templateId: string | null;
  description: string | null;
  customInstructions: string | null;
  visualBible: unknown;
};

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>, until: number) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length && Date.now() < until) {
        const item = items[next++];
        await worker(item);
      }
    })
  );
}

/** Scene pictures per chapter: two for most books, fewer for long ones. */
function scenesPerChapter(chapterCount: number): number {
  if (chapterCount <= 14) return 2;
  if (chapterCount <= 28) return 1;
  return 0;
}

async function ensureVisualBible(book: IllustrationBook): Promise<VisualBible> {
  const existing = parseVisualBible(book.visualBible);
  if (existing) return existing;
  const style = illustrationStyleFor(book);
  const bible = await buildVisualBible(await loadReelBook(book.id), style.id, {
    stylePrompt: style.prompt,
    medium: "book",
  });
  await db.book.update({ where: { id: book.id }, data: { visualBible: bible } });
  return bible;
}

/** Re-encode for the web (about a sixth of the size); keeps the original if sharp isn't available. */
async function compressForWeb(bytes: Buffer): Promise<Buffer> {
  try {
    const { default: sharp } = await import("sharp");
    const out = await sharp(bytes).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    return out.length < bytes.length ? out : bytes;
  } catch {
    return bytes;
  }
}

function imageType(bytes: Buffer): { ext: string; contentType: string } {
  const png = bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50;
  return png ? { ext: "png", contentType: "image/png" } : { ext: "jpg", contentType: "image/jpeg" };
}

/** Draw and store one picture under a new versioned name that starts with its id. */
export async function drawIllustration(
  bookId: string,
  bible: VisualBible,
  row: { id: string; description: string; characters: unknown; mood: string },
  options: { safe?: boolean } = {}
): Promise<{ url: string; prompt: string }> {
  const characters = Array.isArray(row.characters) ? row.characters.map(String) : [];
  const mood = row.mood as ScoreMood;
  const prompt = options.safe
    ? buildSafeShotPrompt(bible, { description: row.description, mood }, BOOK_FRAME_RULES)
    : buildShotPrompt(bible, { description: row.description, characters, mood }, BOOK_FRAME_RULES);
  const bytes = await compressForWeb(
    await runFluxImage(prompt, {
      ...ILLUSTRATION_SIZE,
      negativePrompt: REEL_NEGATIVE_PROMPT,
      label: "illustration",
    })
  );
  const { ext, contentType } = imageType(bytes);
  const url = await uploadIllustrationToR2(
    bookId,
    `${row.id}-${Date.now().toString(36)}.${ext}`,
    bytes,
    contentType
  );
  return { url, prompt };
}

async function drawRow(
  bookId: string,
  bible: VisualBible,
  row: { id: string; description: string; characters: unknown; mood: string; attempts: number }
) {
  const claimed = await db.bookIllustration.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { status: "DRAWING", claimedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  try {
    let result: { url: string; prompt: string };
    try {
      result = await drawIllustration(bookId, bible, row);
    } catch (error) {
      // Usually a refused prompt: fall back to the setting and mood without the action.
      console.warn(
        `[illustrations] ${row.id} failed, trying a gentler prompt:`,
        error instanceof Error ? error.message : error
      );
      result = await drawIllustration(bookId, bible, row, { safe: true });
    }
    await db.bookIllustration.update({
      where: { id: row.id },
      data: { status: "READY", imageUrl: result.url, prompt: result.prompt, error: null, claimedAt: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[illustrations] ${row.id} could not be drawn:`, message);
    await db.bookIllustration.update({
      where: { id: row.id },
      data: {
        status: row.attempts + 1 >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        error: message.slice(0, 1000),
        claimedAt: null,
      },
    });
  }
}

/**
 * Put a chapter's finished pictures in place once none are still waiting:
 * the opener on the chapter, scenes into their sections after the paragraph
 * they show. Returns false while pictures are still being drawn.
 */
async function placeChapter(chapterId: string): Promise<boolean> {
  const rows = await db.bookIllustration.findMany({
    where: { chapterId },
    orderBy: { position: "asc" },
  });
  // Not planned yet (the run stopped before reaching it): leave it for the next run.
  // Chapters that need no pictures are marked done by the planner instead.
  if (rows.length === 0) return false;
  if (rows.some((r) => r.status === "PENDING" || r.status === "DRAWING")) return false;

  const opener = rows.find((r) => r.kind === "OPENER" && r.status === "READY" && r.imageUrl);
  const scenes = rows.filter(
    (r) => r.kind === "SCENE" && r.status === "READY" && r.imageUrl && !r.placedAt && r.sectionId
  );

  await db.$transaction(async (tx) => {
    const sections = await tx.section.findMany({
      where: { chapterId },
      orderBy: { number: "asc" },
      select: { id: true, content: true },
    });
    const contents = new Map(sections.map((s) => [s.id, s.content ?? ""]));
    for (const scene of scenes) {
      const content = contents.get(scene.sectionId!);
      if (content == null || content.includes(`/${scene.id}-`)) continue;
      contents.set(
        scene.sectionId!,
        insertFigureAfterParagraph(content, scene.paragraphIndex ?? 0, figureLine(scene.caption ?? "", scene.imageUrl!))
      );
    }
    for (const section of sections) {
      const content = contents.get(section.id) ?? "";
      if (content !== (section.content ?? "")) {
        await tx.section.update({ where: { id: section.id }, data: { content } });
      }
    }
    await tx.chapter.update({
      where: { id: chapterId },
      data: {
        ...(opener ? { imageUrl: opener.imageUrl } : {}),
        content: sections.map((s) => contents.get(s.id) ?? "").join("\n\n"),
        illustratedAt: new Date(),
      },
    });
    const placedIds = [...scenes.map((s) => s.id), ...(opener ? [opener.id] : [])];
    if (placedIds.length) {
      await tx.bookIllustration.updateMany({
        where: { id: { in: placedIds } },
        data: { placedAt: new Date() },
      });
    }
  });
  return true;
}

async function planChapter(
  book: IllustrationBook,
  bible: VisualBible,
  chapter: {
    id: string;
    number: number;
    title: string;
    summary: string | null;
    sections: { id: string; number: number; content: string | null }[];
    illustrations: { kind: string }[];
  },
  sceneCount: number
) {
  const hasOpener = chapter.illustrations.some((i) => i.kind === "OPENER");
  const hasScenes = chapter.illustrations.some((i) => i.kind === "SCENE");
  const plan = await planChapterIllustrations({
    book: {
      title: book.title,
      genre: book.genre,
      tone: book.tone,
      language: book.language,
      narrative: isNarrativeBook(book),
    },
    chapter,
    bible,
    wantOpener: !hasOpener,
    sceneCount: hasScenes ? 0 : sceneCount,
  });

  const rows = [
    ...(plan.opener ? [{ kind: "OPENER", position: 0, picture: plan.opener, sectionId: null, paragraphIndex: null }] : []),
    ...plan.scenes.map((scene, i) => ({
      kind: "SCENE",
      position: i + 1,
      picture: scene,
      sectionId: scene.sectionId,
      paragraphIndex: scene.paragraphIndex,
    })),
  ];
  if (!rows.length) {
    // Nothing worth drawing (a very short chapter): mark it done.
    await db.chapter.update({ where: { id: chapter.id }, data: { illustratedAt: new Date() } });
    return;
  }
  await db.bookIllustration.createMany({
    skipDuplicates: true,
    data: rows.map((r) => ({
      bookId: book.id,
      chapterId: chapter.id,
      kind: r.kind,
      position: r.position,
      sectionId: r.sectionId,
      paragraphIndex: r.paragraphIndex,
      description: r.picture.description,
      caption: r.picture.caption || null,
      characters: r.picture.characters,
      mood: r.picture.mood,
    })),
  });
}

/** Chapters ready for pictures, or pictures waiting to be drawn or placed. */
export async function hasIllustrationWork(bookId: string): Promise<boolean> {
  const [chapters, rows] = await Promise.all([
    db.chapter.count({ where: { bookId, status: "COMPLETED", illustratedAt: null } }),
    db.bookIllustration.count({ where: { bookId, status: { in: ["PENDING", "DRAWING"] } } }),
  ]);
  return chapters > 0 || rows > 0;
}

/**
 * Illustrate every finished chapter that doesn't have pictures yet. Chapters
 * still being written are picked up by a later run. The caller owns the
 * book's illustration heartbeat; this keeps it fresh and clears it at the end.
 */
export async function runBookIllustrations(bookId: string): Promise<{ remaining: boolean }> {
  const until = Date.now() + RUN_BUDGET_MS;
  const heartbeat = setInterval(() => {
    void db.book
      .update({ where: { id: bookId }, data: { illustrationHeartbeatAt: new Date() } })
      .catch(() => undefined);
  }, HEARTBEAT_MS);

  try {
    const book = await db.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        genre: true,
        tone: true,
        language: true,
        templateId: true,
        description: true,
        customInstructions: true,
        visualBible: true,
        includeIllustrations: true,
        _count: { select: { chapters: true } },
      },
    });
    if (!book?.includeIllustrations) return { remaining: false };

    const bible = await ensureVisualBible(book);
    const sceneCount = scenesPerChapter(book._count.chapters);
    const failedPlans = new Set<string>();

    while (Date.now() < until) {
      const chapters = await db.chapter.findMany({
        where: { bookId, status: "COMPLETED", illustratedAt: null },
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          title: true,
          summary: true,
          sections: { orderBy: { number: "asc" }, select: { id: true, number: true, content: true } },
          illustrations: { select: { kind: true } },
        },
      });
      if (!chapters.length) break;

      const drawn = await db.bookIllustration.count({ where: { bookId } });
      let budget = MAX_PICTURES_PER_BOOK - drawn;
      const toPlan = chapters.filter((c) => c.illustrations.length === 0 && !failedPlans.has(c.id));
      const planned: { chapter: (typeof toPlan)[number]; scenes: number }[] = [];
      for (const chapter of toPlan) {
        if (budget <= 0) {
          planned.push({ chapter, scenes: -1 });
          continue;
        }
        const scenes = Math.max(0, Math.min(sceneCount, budget - 1));
        budget -= 1 + scenes;
        planned.push({ chapter, scenes });
      }
      await pool(
        planned,
        PLAN_CONCURRENCY,
        async ({ chapter, scenes }) => {
          if (scenes < 0) {
            await db.chapter.update({ where: { id: chapter.id }, data: { illustratedAt: new Date() } });
            return;
          }
          await planChapter(book, bible, chapter, scenes).catch((error) => {
            failedPlans.add(chapter.id);
            console.error(`[illustrations] planning chapter ${chapter.number} failed:`, error);
          });
        },
        until
      );

      const pending = await db.bookIllustration.findMany({
        where: { bookId, status: "PENDING" },
        orderBy: [{ chapter: { number: "asc" } }, { position: "asc" }],
        select: { id: true, description: true, characters: true, mood: true, attempts: true },
      });
      await pool(pending, IMAGE_CONCURRENCY, (row) => drawRow(bookId, bible, row), until);

      let placedAny = false;
      for (const chapter of chapters) {
        placedAny = (await placeChapter(chapter.id).catch((error) => {
          console.error(`[illustrations] placing chapter ${chapter.number} failed:`, error);
          return false;
        })) || placedAny;
      }
      // Nothing moved this round: stop rather than spin; a later run retries.
      if (!placedAny && pending.length === 0) break;
    }

    return { remaining: await hasIllustrationWork(bookId) };
  } finally {
    clearInterval(heartbeat);
    await db.book
      .update({ where: { id: bookId }, data: { illustrationHeartbeatAt: null } })
      .catch(() => undefined);
  }
}
