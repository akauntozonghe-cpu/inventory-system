ALTER TABLE "AppUser"
ALTER COLUMN "featurePermissions"
SET DEFAULT ARRAY[
  'STOCKTAKE'::"FeaturePermission",
  'CATALOG'::"FeaturePermission",
  'STOCKTAKE_HISTORY'::"FeaturePermission"
];

UPDATE "AppUser"
SET "featurePermissions" = array_append("featurePermissions", 'CATALOG'::"FeaturePermission")
WHERE (
  'INVENTORY_SEARCH'::"FeaturePermission" = ANY("featurePermissions")
  OR 'ITEM_VIEW'::"FeaturePermission" = ANY("featurePermissions")
)
AND NOT ('CATALOG'::"FeaturePermission" = ANY("featurePermissions"));
