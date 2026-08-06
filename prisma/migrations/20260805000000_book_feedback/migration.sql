-- CreateTable
CREATE TABLE "BookFeedback" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER,
    "sentiment" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookFeedback_bookId_idx" ON "BookFeedback"("bookId");

-- CreateIndex
CREATE INDEX "BookFeedback_userId_idx" ON "BookFeedback"("userId");

-- CreateIndex
CREATE INDEX "BookFeedback_createdAt_idx" ON "BookFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "BookFeedback_sentiment_idx" ON "BookFeedback"("sentiment");

-- AddForeignKey
ALTER TABLE "BookFeedback" ADD CONSTRAINT "BookFeedback_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookFeedback" ADD CONSTRAINT "BookFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
