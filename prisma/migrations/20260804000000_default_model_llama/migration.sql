-- Prefer fast Llama 3.3 over DeepSeek R1 for new defaults.
-- Users who explicitly want R1 can still pick it in settings.
ALTER TABLE "User" ALTER COLUMN "defaultModel" SET DEFAULT 'llama-3.3';
ALTER TABLE "Book" ALTER COLUMN "model" SET DEFAULT 'llama-3.3';

UPDATE "User"
SET "defaultModel" = 'llama-3.3'
WHERE "defaultModel" IN ('deepseek-r1', 'gpt-4o', 'openai');
