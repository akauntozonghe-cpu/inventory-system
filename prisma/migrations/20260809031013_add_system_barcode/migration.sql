/*
  Warnings:

  - A unique constraint covering the columns `[systemBarcode]` on the table `Item` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "systemBarcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Item_systemBarcode_key" ON "Item"("systemBarcode");
