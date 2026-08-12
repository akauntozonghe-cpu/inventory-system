-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "archiveReason" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Item_isArchived_name_idx" ON "Item"("isArchived", "name");

-- CreateIndex
CREATE INDEX "Item_isArchived_majorCategory_idx" ON "Item"("isArchived", "majorCategory");
