-- AlterTable
ALTER TABLE "HuntSettings" ADD COLUMN "uploadConfig" JSONB;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN "posterURL" TEXT,
ADD COLUMN "durationSec" DOUBLE PRECISION,
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER,
ADD COLUMN "sizeBytes" INTEGER,
ADD COLUMN "originalSizeBytes" INTEGER,
ADD COLUMN "compressed" BOOLEAN;

-- CreateTable
CREATE TABLE "ClientEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "source" TEXT NOT NULL DEFAULT 'client',
    "userId" TEXT,
    "teamId" TEXT,
    "submissionId" TEXT,
    "challengeId" TEXT,
    "sessionId" TEXT,
    "attemptId" TEXT,
    "durationMs" INTEGER,
    "bytes" INTEGER,
    "originalBytes" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "platform" TEXT,
    "browser" TEXT,
    "userAgent" TEXT,
    "connection" TEXT,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB,

    CONSTRAINT "ClientEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadTestRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceLabel" TEXT,
    "connection" TEXT,
    "fileName" TEXT,
    "settings" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "originalKey" TEXT,
    "compressedKey" TEXT,
    "posterKey" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UploadTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientEvent_createdAt_idx" ON "ClientEvent"("createdAt");
CREATE INDEX "ClientEvent_type_createdAt_idx" ON "ClientEvent"("type", "createdAt");
CREATE INDEX "ClientEvent_userId_idx" ON "ClientEvent"("userId");
CREATE INDEX "ClientEvent_attemptId_idx" ON "ClientEvent"("attemptId");
CREATE INDEX "UploadTestRun_userId_idx" ON "UploadTestRun"("userId");
CREATE INDEX "UploadTestRun_createdAt_idx" ON "UploadTestRun"("createdAt");
CREATE INDEX "UploadTestRun_deletedAt_idx" ON "UploadTestRun"("deletedAt");
