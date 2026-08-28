CREATE TABLE "SystemOperationSetting" (
  "id" TEXT NOT NULL DEFAULT 'system',
  "mode" TEXT NOT NULL DEFAULT 'NORMAL',
  "message" TEXT,
  "updatedByUserId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemOperationSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SystemOperationSetting" ("id", "mode", "updatedAt")
VALUES ('system', 'NORMAL', CURRENT_TIMESTAMP);
