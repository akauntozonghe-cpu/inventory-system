CREATE TYPE "FeaturePermission" AS ENUM (
  'STOCKTAKE',
  'INVENTORY_SEARCH',
  'ITEM_VIEW',
  'STOCKTAKE_HISTORY',
  'ITEM_REGISTER'
);

ALTER TABLE "AppUser"
ADD COLUMN "featurePermissions" "FeaturePermission"[] NOT NULL
DEFAULT ARRAY[
  'STOCKTAKE'::"FeaturePermission",
  'INVENTORY_SEARCH'::"FeaturePermission",
  'ITEM_VIEW'::"FeaturePermission",
  'STOCKTAKE_HISTORY'::"FeaturePermission"
];
