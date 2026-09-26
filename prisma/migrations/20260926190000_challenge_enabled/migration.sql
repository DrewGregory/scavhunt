-- AlterTable Challenge: player visibility flag (default true for existing rows)
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "Challenge_enabled_idx" ON "Challenge"("enabled");
