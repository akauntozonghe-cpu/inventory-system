/*
  Warnings:

  - Changed the type of `allocationType` on the `InventoryInstance` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AllocationType" AS ENUM ('home', 'mercari', 'yahoo', 'warehouse', 'sold', 'disposed');

-- AlterTable
ALTER TABLE "InventoryInstance" DROP COLUMN "allocationType",
ADD COLUMN     "allocationType" "AllocationType" NOT NULL;

-- CreateTable
CREATE TABLE "InventoryHistory" (
    "id" TEXT NOT NULL,
    "inventoryInstanceId" TEXT NOT NULL,
    "changeQuantity" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InventoryHistory" ADD CONSTRAINT "InventoryHistory_inventoryInstanceId_fkey" FOREIGN KEY ("inventoryInstanceId") REFERENCES "InventoryInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
