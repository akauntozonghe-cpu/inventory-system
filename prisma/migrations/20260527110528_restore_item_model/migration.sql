-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "managementCode" TEXT,
    "managementGroupCode" TEXT,
    "janCode" TEXT,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "majorCategory" TEXT,
    "minorCategory" TEXT,
    "defaultUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_managementCode_key" ON "Item"("managementCode");
