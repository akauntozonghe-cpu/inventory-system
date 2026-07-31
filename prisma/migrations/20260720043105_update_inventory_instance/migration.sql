/*
  Warnings:

  - The values [mercari,yahoo,sold,disposed] on the enum `AllocationType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AllocationType_new" AS ENUM ('home', 'flea_market', 'warehouse');
ALTER TABLE "InventoryInstance" ALTER COLUMN "allocationType" TYPE "AllocationType_new" USING ("allocationType"::text::"AllocationType_new");
ALTER TYPE "AllocationType" RENAME TO "AllocationType_old";
ALTER TYPE "AllocationType_new" RENAME TO "AllocationType";
DROP TYPE "public"."AllocationType_old";
COMMIT;

-- AlterTable
ALTER TABLE "InventoryInstance" ADD COLUMN     "actualQuantity" INTEGER,
ADD COLUMN     "expirationDate" TEXT,
ADD COLUMN     "lotNo" TEXT,
ADD COLUMN     "majorCategory" TEXT,
ADD COLUMN     "managementCode" TEXT,
ADD COLUMN     "managementGroupCode" TEXT,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "minorCategory" TEXT,
ADD COLUMN     "stocktakeAt" TIMESTAMP(3),
ADD COLUMN     "stocktakeStatus" TEXT NOT NULL DEFAULT '未棚卸',
ADD COLUMN     "unit" TEXT;
