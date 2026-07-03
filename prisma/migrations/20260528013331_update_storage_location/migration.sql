/*
  Warnings:

  - You are about to drop the column `location` on the `InventoryInstance` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "InventoryInstance" DROP COLUMN "location",
ADD COLUMN     "storageLocationId" TEXT;

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageLocation_name_key" ON "StorageLocation"("name");

-- AddForeignKey
ALTER TABLE "InventoryInstance" ADD CONSTRAINT "InventoryInstance_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
