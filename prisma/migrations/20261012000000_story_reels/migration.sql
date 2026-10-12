-- Story Reels: narrated vertical videos with an AI illustration per shot
-- CreateEnum
CREATE TYPE "ReelFormat" AS ENUM ('SHORTS', 'TRAILER', 'AUDIOBOOK');

-- CreateEnum
CREATE TYPE "ReelStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "StoryReel" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "audioId" TEXT,
    "format" "ReelFormat" NOT NULL,
    "status" "ReelStatus" NOT NULL DEFAULT 'PENDING',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "phase" TEXT,
    "title" TEXT NOT NULL,
    "stylePreset" TEXT NOT NULL DEFAULT 'cinematic',
    "voiceId" TEXT,
    "voiceName" TEXT,
    "voiceSettings" JSONB,
    "visualBible" JSONB,
    "billedSeconds" INTEGER NOT NULL DEFAULT 0,
    "shareToken" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StoryReel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelEpisode" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "chapterId" TEXT,
    "status" "ReelStatus" NOT NULL DEFAULT 'PENDING',
    "script" TEXT,
    "audioUrl" TEXT,
    "durationMs" INTEGER,
    "captions" JSONB,
    "videoStatus" TEXT,
    "videoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelShot" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "charStart" INTEGER NOT NULL,
    "charEnd" INTEGER NOT NULL,
    "startMs" INTEGER,
    "endMs" INTEGER,
    "description" TEXT NOT NULL,
    "prompt" TEXT,
    "imageUrl" TEXT,
    "previousImageUrl" TEXT,
    "motion" TEXT NOT NULL DEFAULT 'push-in',
    "mood" TEXT NOT NULL DEFAULT 'neutral',
    "characters" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "rerolls" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelShot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoryReel_shareToken_key" ON "StoryReel"("shareToken");

-- CreateIndex
CREATE INDEX "StoryReel_bookId_idx" ON "StoryReel"("bookId");

-- CreateIndex
CREATE INDEX "StoryReel_userId_createdAt_idx" ON "StoryReel"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StoryReel_status_idx" ON "StoryReel"("status");

-- CreateIndex
CREATE INDEX "ReelEpisode_reelId_idx" ON "ReelEpisode"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "ReelEpisode_reelId_number_key" ON "ReelEpisode"("reelId", "number");

-- CreateIndex
CREATE INDEX "ReelShot_episodeId_idx" ON "ReelShot"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "ReelShot_episodeId_number_key" ON "ReelShot"("episodeId", "number");

-- AddForeignKey
ALTER TABLE "StoryReel" ADD CONSTRAINT "StoryReel_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReel" ADD CONSTRAINT "StoryReel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReel" ADD CONSTRAINT "StoryReel_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "BookAudio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelEpisode" ADD CONSTRAINT "ReelEpisode_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "StoryReel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelShot" ADD CONSTRAINT "ReelShot_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "ReelEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

