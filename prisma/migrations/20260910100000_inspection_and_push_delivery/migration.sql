ALTER TABLE "Item" ADD COLUMN "inspectionExcluded" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "inspectionExclusionReason" TEXT;
ALTER TABLE "DevicePushDelivery" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'PENDING', ADD COLUMN "lastErrorCode" TEXT;
UPDATE "DevicePushDelivery" SET "outcome" = 'LEGACY_FINISHED' WHERE "sentAt" IS NOT NULL;
