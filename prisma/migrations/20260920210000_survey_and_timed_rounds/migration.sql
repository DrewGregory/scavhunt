-- AlterTable
ALTER TABLE "User" ADD COLUMN     "intent" TEXT,
ADD COLUMN     "teamPreferences" TEXT,
ADD COLUMN     "competitiveness" TEXT,
ADD COLUMN     "surveyCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HuntSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HuntSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRoundSchedule" (
    "id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentRoundSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRoundSchedule_round_key" ON "TournamentRoundSchedule"("round");
