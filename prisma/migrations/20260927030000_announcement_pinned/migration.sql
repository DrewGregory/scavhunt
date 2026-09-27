-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Announcement_pinned_idx" ON "Announcement"("pinned");
