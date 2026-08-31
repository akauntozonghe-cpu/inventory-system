ALTER TABLE "InventoryInstance" ADD COLUMN IF NOT EXISTS "expirationAlertDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "InventoryInstance" ADD COLUMN IF NOT EXISTS "expirationManagementStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "InventoryInstance" ADD COLUMN IF NOT EXISTS "expirationNote" TEXT;
ALTER TABLE "InventoryInstance" ADD COLUMN IF NOT EXISTS "expirationReviewedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "InventoryInstance_expirationDate_expirationManagementStatus_idx"
ON "InventoryInstance"("expirationDate", "expirationManagementStatus");
