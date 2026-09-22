-- Stock identity is its id, not the shared JAN or lot attributes. Existing rows and histories remain intact.
DROP INDEX IF EXISTS "InventoryInstance_itemId_storageLocationId_lotNo_expiration_key";
CREATE INDEX "inventory_stock_lookup" ON "InventoryInstance"("itemId", "storageLocationId", "lotNo", "expirationDate");
CREATE INDEX "Item_janCode_idx" ON "Item"("janCode");
