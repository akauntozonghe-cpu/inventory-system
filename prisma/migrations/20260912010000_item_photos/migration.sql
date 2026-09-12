CREATE TABLE "ItemPhoto" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "thumbnail" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ItemPhoto_itemId_createdAt_idx" ON "ItemPhoto"("itemId", "createdAt");
ALTER TABLE "ItemPhoto" ADD CONSTRAINT "ItemPhoto_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
