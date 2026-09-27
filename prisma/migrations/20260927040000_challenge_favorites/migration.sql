-- CreateTable
CREATE TABLE "ChallengeFavorite" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChallengeFavorite_teamId_idx" ON "ChallengeFavorite"("teamId");

-- CreateIndex
CREATE INDEX "ChallengeFavorite_challengeId_idx" ON "ChallengeFavorite"("challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeFavorite_challengeId_teamId_key" ON "ChallengeFavorite"("challengeId", "teamId");

-- AddForeignKey
ALTER TABLE "ChallengeFavorite" ADD CONSTRAINT "ChallengeFavorite_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeFavorite" ADD CONSTRAINT "ChallengeFavorite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
