/*
  Warnings:

  - A unique constraint covering the columns `[managementCode]` on the table `Item` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "defaultUnit" TEXT,
ADD COLUMN     "majorCategory" TEXT,
ADD COLUMN     "managementCode" TEXT,
ADD COLUMN     "managementGroupCode" TEXT,
ADD COLUMN     "minorCategory" TEXT;

-- CreateTable
CREATE TABLE "InventoryInstance" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "allocationType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT,
    "lotNo" TEXT,
    "serialNo" TEXT,
    "expiryDate" TIMESTAMP(3),
    "parentInstanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryEvent" (
    "id" TEXT NOT NULL,
    "inventoryInstanceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "quantityBefore" INTEGER,
    "quantityAfter" INTEGER,
    "allocationBefore" TEXT,
    "allocationAfter" TEXT,
    "statusBefore" TEXT,
    "statusAfter" TEXT,
    "locationBefore" TEXT,
    "locationAfter" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_managementCode_key" ON "Item"("managementCode");

-- AddForeignKey
ALTER TABLE "InventoryInstance" ADD CONSTRAINT "InventoryInstance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryInstance" ADD CONSTRAINT "InventoryInstance_parentInstanceId_fkey" FOREIGN KEY ("parentInstanceId") REFERENCES "InventoryInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_inventoryInstanceId_fkey" FOREIGN KEY ("inventoryInstanceId") REFERENCES "InventoryInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
