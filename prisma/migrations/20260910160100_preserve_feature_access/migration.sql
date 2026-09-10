-- Preserve existing functionality; camera exemption is never granted automatically.
UPDATE "AppUser" SET "featurePermissions" = array_append("featurePermissions",'STOCKTAKE_START'::"FeaturePermission") WHERE 'STOCKTAKE'=ANY("featurePermissions") AND NOT 'STOCKTAKE_START'=ANY("featurePermissions");
UPDATE "AppUser" SET "featurePermissions" = "featurePermissions" || ARRAY['MARKETPLACE','MARKETPLACE_SETTINGS']::"FeaturePermission"[];
UPDATE "AppUser" SET "featurePermissions" = "featurePermissions" || ARRAY['EXPIRY','LABEL_PRINT']::"FeaturePermission"[] WHERE 'CATALOG'=ANY("featurePermissions");
ALTER TABLE "AppUser" ALTER COLUMN "featurePermissions" SET DEFAULT ARRAY['STOCKTAKE','CATALOG','STOCKTAKE_HISTORY','STOCKTAKE_START','MARKETPLACE','MARKETPLACE_SETTINGS','EXPIRY','LABEL_PRINT']::"FeaturePermission"[];
