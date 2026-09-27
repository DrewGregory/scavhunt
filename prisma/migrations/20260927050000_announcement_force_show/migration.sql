-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN "forceShow" BOOLEAN NOT NULL DEFAULT false;

-- Preserve interrupt behavior for already-published announcements.
UPDATE "Announcement" SET "forceShow" = true WHERE "publishedAt" IS NOT NULL AND "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "Announcement_forceShow_idx" ON "Announcement"("forceShow");
