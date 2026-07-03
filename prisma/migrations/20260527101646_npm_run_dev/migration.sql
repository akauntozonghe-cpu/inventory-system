/*
  Warnings:

  - You are about to drop the `InventoryEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InventoryInstance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Item` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "InventoryEvent" DROP CONSTRAINT "InventoryEvent_inventoryInstanceId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryInstance" DROP CONSTRAINT "InventoryInstance_itemId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryInstance" DROP CONSTRAINT "InventoryInstance_parentInstanceId_fkey";

-- DropTable
DROP TABLE "InventoryEvent";

-- DropTable
DROP TABLE "InventoryInstance";

-- DropTable
DROP TABLE "Item";
