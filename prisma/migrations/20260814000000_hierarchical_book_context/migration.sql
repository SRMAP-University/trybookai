-- Hierarchical book context: Bible, story/chapter/section state, canon facts
CREATE TABLE IF NOT EXISTS "BookBible" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "styleNotes" TEXT,
    "worldRules" TEXT,
    "themes" JSONB,
    "mysteries" JSONB,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookBible_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BookBible_bookId_key" ON "BookBible"("bookId");

CREATE TABLE IF NOT EXISTS "BibleCharacter" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" JSONB,
    "profile" TEXT,
    "relationships" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BibleCharacter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BibleCharacter_bibleId_idx" ON "BibleCharacter"("bibleId");
CREATE INDEX IF NOT EXISTS "BibleCharacter_bibleId_name_idx" ON "BibleCharacter"("bibleId", "name");

CREATE TABLE IF NOT EXISTS "BibleLocation" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BibleLocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BibleLocation_bibleId_idx" ON "BibleLocation"("bibleId");
CREATE INDEX IF NOT EXISTS "BibleLocation_bibleId_name_idx" ON "BibleLocation"("bibleId", "name");

CREATE TABLE IF NOT EXISTS "BibleFaction" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BibleFaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BibleFaction_bibleId_idx" ON "BibleFaction"("bibleId");

CREATE TABLE IF NOT EXISTS "BibleObject" (
    "id" TEXT NOT NULL,
    "bibleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BibleObject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BibleObject_bibleId_idx" ON "BibleObject"("bibleId");

CREATE TABLE IF NOT EXISTS "StoryState" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "plotPhase" TEXT,
    "timelineCursor" TEXT,
    "openThreads" JSONB,
    "arcs" JSONB,
    "partSummary" TEXT,
    "bookSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoryState_bookId_key" ON "StoryState"("bookId");

CREATE TABLE IF NOT EXISTS "CanonFact" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "predicate" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CANON',
    "sourceChapterId" TEXT,
    "sourceSectionId" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanonFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CanonFact_bookId_idx" ON "CanonFact"("bookId");
CREATE INDEX IF NOT EXISTS "CanonFact_bookId_subject_idx" ON "CanonFact"("bookId", "subject");
CREATE INDEX IF NOT EXISTS "CanonFact_bookId_status_idx" ON "CanonFact"("bookId", "status");

CREATE TABLE IF NOT EXISTS "ChapterState" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "summary" TEXT,
    "charactersPresent" JSONB,
    "location" TEXT,
    "events" JSONB,
    "newFacts" JSONB,
    "openThreads" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChapterState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChapterState_chapterId_key" ON "ChapterState"("chapterId");

CREATE TABLE IF NOT EXISTS "SectionState" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "summary" TEXT,
    "objective" TEXT,
    "charactersPresent" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SectionState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SectionState_sectionId_key" ON "SectionState"("sectionId");

ALTER TABLE "BookBible" ADD CONSTRAINT "BookBible_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BibleCharacter" ADD CONSTRAINT "BibleCharacter_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "BookBible"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BibleLocation" ADD CONSTRAINT "BibleLocation_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "BookBible"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BibleFaction" ADD CONSTRAINT "BibleFaction_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "BookBible"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BibleObject" ADD CONSTRAINT "BibleObject_bibleId_fkey" FOREIGN KEY ("bibleId") REFERENCES "BookBible"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryState" ADD CONSTRAINT "StoryState_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanonFact" ADD CONSTRAINT "CanonFact_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChapterState" ADD CONSTRAINT "ChapterState_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionState" ADD CONSTRAINT "SectionState_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
