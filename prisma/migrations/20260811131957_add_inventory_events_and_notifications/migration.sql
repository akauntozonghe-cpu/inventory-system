-- CreateEnum
CREATE TYPE "RegistrationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InventoryEventType" AS ENUM ('OPENING_BALANCE', 'RECEIPT', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'STOCKTAKE', 'ADJUSTMENT', 'DISPOSAL', 'RETURN', 'IMPORT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('STOCKTAKE_COMPLETED', 'STOCKTAKE_CONFLICT', 'STOCKTAKE_DIFFERENCE', 'LOW_STOCK', 'EXPIRY_ALERT', 'REGISTRATION_REQUEST', 'SYSTEM_ERROR');

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('ADMIN', 'USER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StocktakeStatus" ADD VALUE 'CONFLICT';
ALTER TYPE "StocktakeStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "StocktakeSession" ADD COLUMN     "cancellationNote" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" TEXT;

-- CreateTable
CREATE TABLE "ItemRegistrationRequest" (
    "id" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "stocktakeSessionId" TEXT,
    "scannedCode" TEXT,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "managementCode" TEXT,
    "managementGroupCode" TEXT,
    "majorCategory" TEXT,
    "minorCategory" TEXT,
    "storageLocationId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT,
    "lotNo" TEXT,
    "expirationDate" TEXT,
    "memo" TEXT,
    "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewMemo" TEXT,
    "createdItemId" TEXT,
    "createdInventoryInstanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemRegistrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryEvent" (
    "id" TEXT NOT NULL,
    "inventoryInstanceId" TEXT NOT NULL,
    "eventType" "InventoryEventType" NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "memo" TEXT,
    "detail" JSONB,
    "performedByUserId" TEXT,
    "stocktakeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "audience" "NotificationAudience" NOT NULL DEFAULT 'ADMIN',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "recipientUserId" TEXT,
    "stocktakeSessionId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemRegistrationRequest_status_createdAt_idx" ON "ItemRegistrationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ItemRegistrationRequest_requestedByUserId_createdAt_idx" ON "ItemRegistrationRequest"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ItemRegistrationRequest_stocktakeSessionId_idx" ON "ItemRegistrationRequest"("stocktakeSessionId");

-- CreateIndex
CREATE INDEX "ItemRegistrationRequest_storageLocationId_idx" ON "ItemRegistrationRequest"("storageLocationId");

-- CreateIndex
CREATE INDEX "InventoryEvent_inventoryInstanceId_createdAt_idx" ON "InventoryEvent"("inventoryInstanceId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryEvent_eventType_createdAt_idx" ON "InventoryEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryEvent_stocktakeSessionId_idx" ON "InventoryEvent"("stocktakeSessionId");

-- CreateIndex
CREATE INDEX "InventoryEvent_performedByUserId_createdAt_idx" ON "InventoryEvent"("performedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_audience_readAt_createdAt_idx" ON "Notification"("audience", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx" ON "Notification"("recipientUserId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_stocktakeSessionId_idx" ON "Notification"("stocktakeSessionId");

-- CreateIndex
CREATE INDEX "StocktakeSession_cancelledByUserId_idx" ON "StocktakeSession"("cancelledByUserId");

-- AddForeignKey
ALTER TABLE "ItemRegistrationRequest" ADD CONSTRAINT "ItemRegistrationRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRegistrationRequest" ADD CONSTRAINT "ItemRegistrationRequest_stocktakeSessionId_fkey" FOREIGN KEY ("stocktakeSessionId") REFERENCES "StocktakeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRegistrationRequest" ADD CONSTRAINT "ItemRegistrationRequest_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_inventoryInstanceId_fkey" FOREIGN KEY ("inventoryInstanceId") REFERENCES "InventoryInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_stocktakeSessionId_fkey" FOREIGN KEY ("stocktakeSessionId") REFERENCES "StocktakeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_stocktakeSessionId_fkey" FOREIGN KEY ("stocktakeSessionId") REFERENCES "StocktakeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
