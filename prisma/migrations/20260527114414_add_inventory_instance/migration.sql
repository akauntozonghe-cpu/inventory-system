-- CreateTable
CREATE TABLE "InventoryInstance" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "allocationType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryInstance_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InventoryInstance" ADD CONSTRAINT "InventoryInstance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
