-- AlterTable
ALTER TABLE "HuntSettings" ADD COLUMN "territoryEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#3182CE';

-- AlterTable
ALTER TABLE "Neighborhood" ADD COLUMN "boundary" JSONB,
ADD COLUMN "onMap" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "centerLat" DOUBLE PRECISION,
ADD COLUMN "centerLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "NeighborhoodDeposit" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "neighborhoodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NeighborhoodDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NeighborhoodDeposit_neighborhoodId_idx" ON "NeighborhoodDeposit"("neighborhoodId");

-- CreateIndex
CREATE INDEX "NeighborhoodDeposit_teamId_idx" ON "NeighborhoodDeposit"("teamId");

-- CreateIndex
CREATE INDEX "NeighborhoodDeposit_userId_idx" ON "NeighborhoodDeposit"("userId");

-- CreateIndex
CREATE INDEX "NeighborhoodDeposit_createdAt_idx" ON "NeighborhoodDeposit"("createdAt");

-- AddForeignKey
ALTER TABLE "NeighborhoodDeposit" ADD CONSTRAINT "NeighborhoodDeposit_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeighborhoodDeposit" ADD CONSTRAINT "NeighborhoodDeposit_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeighborhoodDeposit" ADD CONSTRAINT "NeighborhoodDeposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
