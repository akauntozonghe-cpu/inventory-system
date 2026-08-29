ALTER TABLE "SystemOperationSetting"
ADD COLUMN "autoCheckIntervalMinutes" INTEGER NOT NULL DEFAULT 360;

UPDATE "SystemOperationSetting"
SET "mode" = 'TEST'
WHERE "mode" = 'INSPECTION';
