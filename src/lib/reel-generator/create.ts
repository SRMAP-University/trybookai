import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { dbTransaction } from "@/lib/db-transaction";
import { resolveVoice, type VoiceSettingsConfig } from "@/lib/elevenlabs-voices";
import {
  REEL_OVERAGE_SECONDS,
  canUseVisualAudiobook,
  reelAllowanceSeconds,
  reelSecondsUsed,
  shortWordsFor,
} from "@/lib/reel-generator/quota";
import {
  TRAILER_TARGET_WORDS,
  estimateReelSeconds,
  formatReelSeconds,
  pacingSeconds,
  reelStyle,
  type ReelFormat,
  type ReelPacing,
} from "@/lib/reel-generator/types";

/** An error with the HTTP status the API should answer with. */
export class ReelError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ReelError";
  }
}

export type CreateReelInput = {
  userId: string;
  bookId: string;
  format: ReelFormat;
  chapterIds?: string[];
  stylePreset?: string;
  voiceId?: string;
  voiceName?: string;
  voiceSettings: VoiceSettingsConfig;
  /** How often the picture changes; dynamic by default. */
  pacing?: ReelPacing;
};

/**
 * Check the plan and allowance, then create the reel and its episodes.
 * The estimated narration is reserved in the same transaction (with the
 * user's row locked) so two requests at once can't overspend; the runner
 * replaces it with the real length once narrated.
 */
export async function createReel(input: CreateReelInput) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { plan: true, trialEndsAt: true },
  });

  if (input.format === "AUDIOBOOK") {
    if (!canUseVisualAudiobook(user)) {
      throw new ReelError("Visual Audiobook is part of Premium. Upgrade to illustrate your audiobook.", 403);
    }
    throw new ReelError("Visual Audiobook is coming soon.", 400);
  }

  const book = await db.book.findFirst({
    where: { id: input.bookId, userId: input.userId },
    select: {
      id: true,
      title: true,
      status: true,
      chapters: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          title: true,
          sections: { select: { content: true } },
        },
      },
    },
  });
  if (!book) throw new ReelError("Book not found", 404);

  const written = book.chapters.filter((c) => c.sections.some((s) => s.content?.trim()));
  if (written.length === 0) {
    throw new ReelError("Write at least one chapter before making a reel.", 400);
  }

  let episodes: { number: number; title: string; chapterId: string | null }[];
  let targetWords: number;
  if (input.format === "TRAILER") {
    episodes = [{ number: 1, title: "Trailer", chapterId: null }];
    targetWords = TRAILER_TARGET_WORDS;
  } else {
    const wanted = input.chapterIds?.length ? new Set(input.chapterIds) : null;
    const chosen = wanted ? written.filter((c) => wanted.has(c.id)) : written;
    if (chosen.length === 0) throw new ReelError("Pick at least one written chapter.", 400);
    episodes = chosen.map((c) => ({
      number: c.number,
      title: `Chapter ${c.number}: ${c.title}`,
      chapterId: c.id,
    }));
    targetWords = shortWordsFor(user);
  }

  const estimate = episodes.length * estimateReelSeconds(targetWords);
  const allowance = reelAllowanceSeconds(user);
  const voice = resolveVoice(input.voiceId, input.voiceName);
  const style = reelStyle(input.stylePreset);

  return dbTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
    const used = await reelSecondsUsed(input.userId, tx);
    const remaining = allowance - used;
    if (estimate > remaining + REEL_OVERAGE_SECONDS) {
      throw new ReelError(
        remaining <= 0
          ? "You've used this month's reel minutes. Upgrade or wait for next month."
          : `This needs about ${formatReelSeconds(estimate)} of reel time, but you have ${formatReelSeconds(remaining)} left this month.`,
        402
      );
    }

    return tx.storyReel.create({
      data: {
        bookId: book.id,
        userId: input.userId,
        format: input.format,
        title: input.format === "TRAILER" ? `${book.title} · Trailer` : `${book.title} · Chapter shorts`,
        stylePreset: style.id,
        voiceId: voice.voiceId,
        voiceName: voice.voiceName,
        voiceSettings: {
          ...input.voiceSettings,
          targetWords,
          shotSeconds: pacingSeconds(input.pacing),
        },
        billedSeconds: estimate,
        episodes: { create: episodes },
      },
      select: { id: true },
    });
  });
}

/** Random, unguessable token for an unlisted share link. */
export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}
