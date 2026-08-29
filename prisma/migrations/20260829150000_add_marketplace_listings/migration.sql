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
  "packagingCost" INTEGER DEFAULT 0,
  "acquisitionCostSnapshot" INTEGER,
  "shippingMethod" TEXT,
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

ALTER TABLE "InventoryInstance" ADD COLUMN "acquisitionCost" INTEGER;
ALTER TABLE "InventoryInstance" ADD COLUMN "packageWeightGrams" INTEGER;
ALTER TABLE "InventoryInstance" ADD COLUMN "packageLengthCm" INTEGER;
ALTER TABLE "InventoryInstance" ADD COLUMN "packageWidthCm" INTEGER;
ALTER TABLE "InventoryInstance" ADD COLUMN "packageHeightCm" INTEGER;

CREATE TABLE "SalesChannelSetting" (
  "id" TEXT NOT NULL, "channel" TEXT NOT NULL, "displayName" TEXT NOT NULL,
  "integrationMode" TEXT NOT NULL DEFAULT 'MANUAL', "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "feeRateBps" INTEGER NOT NULL DEFAULT 1000, "credentialEnvKey" TEXT,
  "lastSyncAt" TIMESTAMP(3), "lastSyncStatus" TEXT, "lastSyncMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesChannelSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesChannelSetting_channel_key" ON "SalesChannelSetting"("channel");

CREATE TABLE "ShippingRate" (
  "id" TEXT NOT NULL, "channel" TEXT NOT NULL, "carrier" TEXT NOT NULL, "methodName" TEXT NOT NULL,
  "fee" INTEGER NOT NULL, "maxWeightGrams" INTEGER, "maxLengthCm" INTEGER, "maxWidthCm" INTEGER,
  "maxHeightCm" INTEGER, "maxTotalDimensionsCm" INTEGER, "anonymous" BOOLEAN NOT NULL DEFAULT false,
  "tracking" BOOLEAN NOT NULL DEFAULT true, "compensation" BOOLEAN NOT NULL DEFAULT false,
  "effectiveFrom" TIMESTAMP(3) NOT NULL, "effectiveTo" TIMESTAMP(3), "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShippingRate_channel_isActive_effectiveFrom_idx" ON "ShippingRate"("channel", "isActive", "effectiveFrom");

CREATE TABLE "SalesRecommendationSetting" (
  "id" TEXT NOT NULL DEFAULT 'system', "regionName" TEXT NOT NULL DEFAULT '東京都',
  "latitude" DOUBLE PRECISION NOT NULL DEFAULT 35.6762, "longitude" DOUBLE PRECISION NOT NULL DEFAULT 139.6503,
  "packagingCostDefault" INTEGER NOT NULL DEFAULT 100, "targetProfitRateBps" INTEGER NOT NULL DEFAULT 2000,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SalesRecommendationSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SalesChannelSetting" ("id","channel","displayName","integrationMode","feeRateBps","updatedAt") VALUES
('channel-mercari','mercari','メルカリ','MANUAL',0,CURRENT_TIMESTAMP),
('channel-rakuma','rakuma','ラクマ','MANUAL',0,CURRENT_TIMESTAMP),
('channel-yahoo-furima','yahoo_furima','Yahoo!フリマ','MANUAL',0,CURRENT_TIMESTAMP),
('channel-flea-common','flea_market','フリマ共通','CSV',0,CURRENT_TIMESTAMP);
INSERT INTO "SalesRecommendationSetting" ("id","updatedAt") VALUES ('system',CURRENT_TIMESTAMP);
