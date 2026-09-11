ALTER TABLE "SalesRecommendationSetting" ADD COLUMN "shippingOriginPrefecture" TEXT,
ADD COLUMN "shippingLeadDays" INTEGER;
ALTER TABLE "ShippingRate" ADD COLUMN "originPrefecture" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN "shippingOriginPrefecture" TEXT,
ADD COLUMN "shippingLeadDays" INTEGER,
ADD COLUMN "shippingDueAt" TIMESTAMP(3);
