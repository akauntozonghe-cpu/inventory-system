-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "janCode" TEXT,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);
