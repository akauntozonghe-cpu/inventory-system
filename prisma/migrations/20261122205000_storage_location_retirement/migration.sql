-- Reversible storage location retirement, retaining all inventory foreign keys.
ALTER TABLE "StorageLocation"
  ADD COLUMN "retiredAt" TIMESTAMP(3),
  ADD COLUMN "retirementReason" TEXT,
  ADD COLUMN "retiredByUserId" TEXT;
CREATE INDEX "StorageLocation_retiredAt_idx" ON "StorageLocation"("retiredAt");