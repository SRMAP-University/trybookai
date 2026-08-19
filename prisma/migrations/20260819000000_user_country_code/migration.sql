-- Store visitor country (ISO 3166-1 alpha-2) for admin flags
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "countryCode" TEXT;

CREATE INDEX IF NOT EXISTS "User_countryCode_idx" ON "User"("countryCode");
