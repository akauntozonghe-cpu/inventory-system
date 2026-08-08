-- CreateEnum
CREATE TYPE "ErrorSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ErrorReportStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('NOT_ATTEMPTED', 'IN_PROGRESS', 'RECOVERED', 'FAILED', 'ADMIN_REQUIRED');

-- AlterTable
ALTER TABLE "AppUser" ALTER COLUMN "mustChangePassword" SET DEFAULT false;

-- CreateTable
CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "ErrorSeverity" NOT NULL DEFAULT 'ERROR',
    "status" "ErrorReportStatus" NOT NULL DEFAULT 'OPEN',
    "route" TEXT,
    "sessionId" TEXT,
    "detail" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "recoveryStatus" "RecoveryStatus" NOT NULL DEFAULT 'NOT_ATTEMPTED',
    "recoveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "recoveredAt" TIMESTAMP(3),
    "recoveryNote" TEXT,
    "reporterUserId" TEXT,

    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "route" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminUserId" TEXT NOT NULL,
    "errorReportId" TEXT,
    "targetUserId" TEXT,
    "targetSessionId" TEXT,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorReport_status_occurredAt_idx" ON "ErrorReport"("status", "occurredAt");

-- CreateIndex
CREATE INDEX "ErrorReport_sessionId_occurredAt_idx" ON "ErrorReport"("sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "ErrorReport_code_occurredAt_idx" ON "ErrorReport"("code", "occurredAt");

-- CreateIndex
CREATE INDEX "AdminActionLog_adminUserId_createdAt_idx" ON "AdminActionLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminActionLog_errorReportId_createdAt_idx" ON "AdminActionLog"("errorReportId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminActionLog_targetSessionId_createdAt_idx" ON "AdminActionLog"("targetSessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "ErrorReport" ADD CONSTRAINT "ErrorReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_errorReportId_fkey" FOREIGN KEY ("errorReportId") REFERENCES "ErrorReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
