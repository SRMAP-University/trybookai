-- Illustrated books: chapter-opener and scene pictures drawn as chapters finish
-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "includeIllustrations" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visualBible" JSONB,
ADD COLUMN     "illustrationHeartbeatAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "illustratedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BookIllustration" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sectionId" TEXT,
    "paragraphIndex" INTEGER,
    "description" TEXT NOT NULL,
    "caption" TEXT,
    "characters" JSONB,
    "mood" TEXT NOT NULL DEFAULT 'neutral',
    "prompt" TEXT,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "error" TEXT,
    "placedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookIllustration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookIllustration_bookId_status_idx" ON "BookIllustration"("bookId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BookIllustration_chapterId_kind_position_key" ON "BookIllustration"("chapterId", "kind", "position");

-- AddForeignKey
ALTER TABLE "BookIllustration" ADD CONSTRAINT "BookIllustration_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookIllustration" ADD CONSTRAINT "BookIllustration_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
