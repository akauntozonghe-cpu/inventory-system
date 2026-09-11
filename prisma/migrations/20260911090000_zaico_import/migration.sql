CREATE TABLE "ZaicoImportRecord" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "originalRow" JSONB NOT NULL,
  "row" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "itemId" TEXT,
  "inventoryId" TEXT,
  "reviewedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ZaicoImportRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ZaicoImportRecord_key_key" ON "ZaicoImportRecord"("key");
CREATE INDEX "ZaicoImportRecord_status_createdAt_idx" ON "ZaicoImportRecord"("status", "createdAt");
