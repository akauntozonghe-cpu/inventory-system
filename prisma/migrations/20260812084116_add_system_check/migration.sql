-- CreateEnum
CREATE TYPE "SystemCheckMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "SystemCheckStatus" AS ENUM ('PASSED', 'WARNING', 'FAILED');

-- CreateEnum
CREATE TYPE "SystemCheckItemType" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "SystemCheckItemStatus" AS ENUM ('PASS', 'WARNING', 'FAIL', 'NOT_RUN');

-- CreateTable
CREATE TABLE "SystemCheckRun" (
    "id" TEXT NOT NULL,
    "mode" "SystemCheckMode" NOT NULL,
    "status" "SystemCheckStatus" NOT NULL,
    "summary" TEXT,
    "executedByUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemCheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemCheckItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "SystemCheckItemType" NOT NULL,
    "status" "SystemCheckItemStatus" NOT NULL,
    "detail" TEXT,
    "expected" TEXT,
    "actual" TEXT,
    "errorCode" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemCheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemCheckRun_createdAt_idx" ON "SystemCheckRun"("createdAt");

-- CreateIndex
CREATE INDEX "SystemCheckRun_executedByUserId_createdAt_idx" ON "SystemCheckRun"("executedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemCheckRun_status_createdAt_idx" ON "SystemCheckRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SystemCheckItem_runId_status_idx" ON "SystemCheckItem"("runId", "status");

-- AddForeignKey
ALTER TABLE "SystemCheckRun" ADD CONSTRAINT "SystemCheckRun_executedByUserId_fkey" FOREIGN KEY ("executedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemCheckItem" ADD CONSTRAINT "SystemCheckItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SystemCheckRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
