-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");

-- AlterTable Team
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Team_deletedAt_idx" ON "Team"("deletedAt");

-- AlterTable Challenge
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Challenge_deletedAt_idx" ON "Challenge"("deletedAt");

-- AlterTable Submission
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Submission_deletedAt_idx" ON "Submission"("deletedAt");

-- AlterTable Neighborhood
ALTER TABLE "Neighborhood" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Neighborhood_deletedAt_idx" ON "Neighborhood"("deletedAt");

-- NeighborhoodDeposit: migrate voidedAt -> deletedAt
ALTER TABLE "NeighborhoodDeposit" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
UPDATE "NeighborhoodDeposit" SET "deletedAt" = "voidedAt" WHERE "voidedAt" IS NOT NULL AND "deletedAt" IS NULL;
DROP INDEX IF EXISTS "NeighborhoodDeposit_voidedAt_idx";
ALTER TABLE "NeighborhoodDeposit" DROP COLUMN IF EXISTS "voidedAt";
CREATE INDEX IF NOT EXISTS "NeighborhoodDeposit_deletedAt_idx" ON "NeighborhoodDeposit"("deletedAt");
