ALTER TABLE "MarketplaceListing"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "itemCondition" TEXT,
  ADD COLUMN IF NOT EXISTS "photoUrls" JSONB,
  ADD COLUMN IF NOT EXISTS "listingUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "shippingStatus" TEXT NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "MarketplaceListing_shippingStatus_updatedAt_idx"
  ON "MarketplaceListing"("shippingStatus", "updatedAt");
