-- CreateEnum
CREATE TYPE "StocktakeScope" AS ENUM ('ALL', 'LOCATION', 'MAJOR_CATEGORY', 'MINOR_CATEGORY');

-- AlterTable
ALTER TABLE "StocktakeSession" ADD COLUMN     "scopeLabel" TEXT,
ADD COLUMN     "scopeType" "StocktakeScope" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "scopeValue" TEXT;

-- CreateTable
CREATE TABLE "StocktakeTarget" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "inventoryInstanceId" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StocktakeTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeTarget_sessionId_inventoryInstanceId_key" ON "StocktakeTarget"("sessionId", "inventoryInstanceId");

-- AddForeignKey
ALTER TABLE "StocktakeTarget" ADD CONSTRAINT "StocktakeTarget_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StocktakeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeTarget" ADD CONSTRAINT "StocktakeTarget_inventoryInstanceId_fkey" FOREIGN KEY ("inventoryInstanceId") REFERENCES "InventoryInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
