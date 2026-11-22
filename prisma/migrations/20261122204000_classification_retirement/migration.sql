-- Non-destructive classification retirement: keeps IDs, existing QR codes,
-- product category values, inventory records, and stocktake history intact.
ALTER TABLE "Classification"
  ADD COLUMN "retiredAt" TIMESTAMP(3),
  ADD COLUMN "retirementReason" TEXT,
  ADD COLUMN "retiredByUserId" TEXT;
CREATE INDEX "Classification_retiredAt_idx" ON "Classification"("retiredAt");
