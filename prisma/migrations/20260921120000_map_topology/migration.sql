-- AlterTable
ALTER TABLE "Neighborhood" ADD COLUMN "isIsland" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MapTopology" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "transform" JSONB,
    "arcs" JSONB NOT NULL,
    "objects" JSONB NOT NULL,
    "lockedArcs" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapTopology_pkey" PRIMARY KEY ("id")
);
