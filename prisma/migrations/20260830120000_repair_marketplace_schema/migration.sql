-- Repair partially applied marketplace migrations without deleting existing data.
DO $$ BEGIN
  CREATE TYPE "MarketplaceListingStatus" AS ENUM ('DRAFT', 'READY', 'LISTED', 'SOLD', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "InventoryInstance" ADD COLUMN IF NOT EXISTS "acquisitionCost" INTEGER;
ALTER TABLE "InventoryInstance" ADD COLUMN IF NOT EXISTS "packageWeightGrams" INTEGER;
ALTER TABLE "InventoryInstance" ADD COLUMN IF NOT EXISTS "packageLengthCm" INTEGER;
ALTER TABLE "InventoryInstance" ADD COLUMN IF NOT EXISTS "packageWidthCm" INTEGER;
ALTER TABLE "InventoryInstance" ADD COLUMN IF NOT EXISTS "packageHeightCm" INTEGER;

CREATE TABLE IF NOT EXISTS "MarketplaceListing" (
  "id" TEXT NOT NULL,
  "inventoryInstanceId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'flea_market',
  "externalListingId" TEXT,
  "title" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "listedQuantity" INTEGER NOT NULL DEFAULT 1,
  "soldQuantity" INTEGER NOT NULL DEFAULT 0,
  "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "itemCondition" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "photoUrls" JSONB;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "listingUrl" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "fee" INTEGER;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "shippingCost" INTEGER;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "packagingCost" INTEGER DEFAULT 0;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "acquisitionCostSnapshot" INTEGER;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "shippingMethod" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "shippingStatus" TEXT NOT NULL DEFAULT 'NOT_READY';
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "listedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "soldAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceListing" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceListing_channel_externalListingId_key" ON "MarketplaceListing"("channel", "externalListingId");
CREATE INDEX IF NOT EXISTS "MarketplaceListing_status_updatedAt_idx" ON "MarketplaceListing"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "MarketplaceListing_inventoryInstanceId_status_idx" ON "MarketplaceListing"("inventoryInstanceId", "status");

DO $$ BEGIN
  ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_inventoryInstanceId_fkey"
    FOREIGN KEY ("inventoryInstanceId") REFERENCES "InventoryInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SalesChannelSetting" (
  "id" TEXT NOT NULL, "channel" TEXT NOT NULL, "displayName" TEXT NOT NULL,
  "integrationMode" TEXT NOT NULL DEFAULT 'MANUAL', "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "feeRateBps" INTEGER NOT NULL DEFAULT 1000, "credentialEnvKey" TEXT,
  "lastSyncAt" TIMESTAMP(3), "lastSyncStatus" TEXT, "lastSyncMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesChannelSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesChannelSetting_channel_key" ON "SalesChannelSetting"("channel");

CREATE TABLE IF NOT EXISTS "ShippingRate" (
  "id" TEXT NOT NULL, "channel" TEXT NOT NULL, "carrier" TEXT NOT NULL, "methodName" TEXT NOT NULL,
  "fee" INTEGER NOT NULL, "maxWeightGrams" INTEGER, "maxLengthCm" INTEGER, "maxWidthCm" INTEGER,
  "maxHeightCm" INTEGER, "maxTotalDimensionsCm" INTEGER, "anonymous" BOOLEAN NOT NULL DEFAULT false,
  "tracking" BOOLEAN NOT NULL DEFAULT true, "compensation" BOOLEAN NOT NULL DEFAULT false,
  "effectiveFrom" TIMESTAMP(3) NOT NULL, "effectiveTo" TIMESTAMP(3), "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ShippingRate_channel_isActive_effectiveFrom_idx" ON "ShippingRate"("channel", "isActive", "effectiveFrom");

CREATE TABLE IF NOT EXISTS "SalesRecommendationSetting" (
  "id" TEXT NOT NULL DEFAULT 'system', "regionName" TEXT NOT NULL DEFAULT '東京都',
  "latitude" DOUBLE PRECISION NOT NULL DEFAULT 35.6762, "longitude" DOUBLE PRECISION NOT NULL DEFAULT 139.6503,
  "packagingCostDefault" INTEGER NOT NULL DEFAULT 100, "targetProfitRateBps" INTEGER NOT NULL DEFAULT 2000,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesRecommendationSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SalesChannelSetting" ("id","channel","displayName","integrationMode","feeRateBps","updatedAt") VALUES
('channel-mercari','mercari','メルカリ','MANUAL',0,CURRENT_TIMESTAMP),
('channel-rakuma','rakuma','ラクマ','MANUAL',0,CURRENT_TIMESTAMP),
('channel-yahoo-furima','yahoo_furima','Yahoo!フリマ','MANUAL',0,CURRENT_TIMESTAMP),
('channel-flea-common','flea_market','フリマ共通','CSV',0,CURRENT_TIMESTAMP)
ON CONFLICT ("channel") DO NOTHING;

INSERT INTO "SalesRecommendationSetting" ("id","updatedAt") VALUES ('system',CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MARKETPLACE_SOLD';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
