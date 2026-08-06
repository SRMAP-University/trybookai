-- Track which client created each book (ios | android | web | unknown)
ALTER TABLE "Book" ADD COLUMN IF NOT EXISTS "createdVia" TEXT NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS "Book_createdVia_idx" ON "Book"("createdVia");
