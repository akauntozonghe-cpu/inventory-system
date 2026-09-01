ALTER TABLE "Classification" ADD COLUMN IF NOT EXISTS "labelCode" TEXT;

UPDATE "Classification"
SET "labelCode" = 'CLS-' || md5("kind" || ':' || "parentName" || ':' || "id")
WHERE "labelCode" IS NULL OR btrim("labelCode") = '';

ALTER TABLE "Classification" ALTER COLUMN "labelCode" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Classification_labelCode_key" ON "Classification"("labelCode");

CREATE TABLE IF NOT EXISTS "ClassificationLabelAlias" (
  "labelCode" TEXT NOT NULL,
  "classificationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassificationLabelAlias_pkey" PRIMARY KEY ("labelCode"),
  CONSTRAINT "ClassificationLabelAlias_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "Classification"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ClassificationLabelAlias_classificationId_idx" ON "ClassificationLabelAlias"("classificationId");

CREATE OR REPLACE FUNCTION sync_item_relations_to_inventory()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "InventoryInstance"
  SET
    "managementCode" = NEW."managementCode",
    "managementGroupCode" = NEW."managementGroupCode",
    "manufacturer" = NEW."manufacturer",
    "majorCategory" = NEW."majorCategory",
    "minorCategory" = NEW."minorCategory"
  WHERE "itemId" = NEW."id"
    AND (
      "managementCode" IS DISTINCT FROM NEW."managementCode" OR
      "managementGroupCode" IS DISTINCT FROM NEW."managementGroupCode" OR
      "manufacturer" IS DISTINCT FROM NEW."manufacturer" OR
      "majorCategory" IS DISTINCT FROM NEW."majorCategory" OR
      "minorCategory" IS DISTINCT FROM NEW."minorCategory"
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Item_sync_relations_to_inventory" ON "Item";
CREATE TRIGGER "Item_sync_relations_to_inventory"
AFTER INSERT OR UPDATE OF "managementCode", "managementGroupCode", "manufacturer", "majorCategory", "minorCategory"
ON "Item"
FOR EACH ROW EXECUTE FUNCTION sync_item_relations_to_inventory();

UPDATE "InventoryInstance" AS inventory
SET
  "managementCode" = item."managementCode",
  "managementGroupCode" = item."managementGroupCode",
  "manufacturer" = item."manufacturer",
  "majorCategory" = item."majorCategory",
  "minorCategory" = item."minorCategory"
FROM "Item" AS item
WHERE inventory."itemId" = item."id"
  AND (
    inventory."managementCode" IS DISTINCT FROM item."managementCode" OR
    inventory."managementGroupCode" IS DISTINCT FROM item."managementGroupCode" OR
    inventory."manufacturer" IS DISTINCT FROM item."manufacturer" OR
    inventory."majorCategory" IS DISTINCT FROM item."majorCategory" OR
    inventory."minorCategory" IS DISTINCT FROM item."minorCategory"
  );
