CREATE TABLE IF NOT EXISTS "Classification" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentName" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Classification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Classification_kind_name_parentName_key" ON "Classification"("kind", "name", "parentName");
CREATE INDEX IF NOT EXISTS "Classification_kind_parentName_name_idx" ON "Classification"("kind", "parentName", "name");

INSERT INTO "Classification" ("id", "kind", "name", "parentName", "updatedAt")
SELECT 'major-' || md5("majorCategory"), 'MAJOR', "majorCategory", '', CURRENT_TIMESTAMP
FROM "Item" WHERE "majorCategory" IS NOT NULL AND btrim("majorCategory") <> ''
GROUP BY "majorCategory" ON CONFLICT DO NOTHING;

INSERT INTO "Classification" ("id", "kind", "name", "parentName", "updatedAt")
SELECT 'minor-' || md5(COALESCE("majorCategory", '') || ':' || "minorCategory"), 'MINOR', "minorCategory", COALESCE("majorCategory", ''), CURRENT_TIMESTAMP
FROM "Item" WHERE "minorCategory" IS NOT NULL AND btrim("minorCategory") <> ''
GROUP BY "majorCategory", "minorCategory" ON CONFLICT DO NOTHING;
