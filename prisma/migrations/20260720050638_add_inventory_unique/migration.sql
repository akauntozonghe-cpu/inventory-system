/*
  Warnings:

  - A unique constraint covering the columns `[itemId,storageLocationId,lotNo,expirationDate]` on the table `InventoryInstance` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "InventoryInstance_itemId_storageLocationId_lotNo_expiration_key" ON "InventoryInstance"("itemId", "storageLocationId", "lotNo", "expirationDate");
