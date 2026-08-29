CREATE TYPE "MarketplaceListingStatus" AS ENUM ('DRAFT', 'READY', 'LISTED', 'SOLD', 'CANCELLED');
ALTER TYPE "NotificationType" ADD VALUE 'MARKETPLACE_SOLD';

CREATE TABLE "MarketplaceListing" (
  "id" TEXT NOT NULL,
  "inventoryInstanceId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'flea_market',
  "externalListingId" TEXT,
  "title" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "listedQuantity" INTEGER NOT NULL DEFAULT 1,
  "soldQuantity" INTEGER NOT NULL DEFAULT 0,
  "fee" INTEGER,
  "shippingCost" INTEGER,
  "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "listedAt" TIMESTAMP(3),
  "soldAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceListing_channel_externalListingId_key" ON "MarketplaceListing"("channel", "externalListingId");
CREATE INDEX "MarketplaceListing_status_updatedAt_idx" ON "MarketplaceListing"("status", "updatedAt");
CREATE INDEX "MarketplaceListing_inventoryInstanceId_status_idx" ON "MarketplaceListing"("inventoryInstanceId", "status");
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_inventoryInstanceId_fkey" FOREIGN KEY ("inventoryInstanceId") REFERENCES "InventoryInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
