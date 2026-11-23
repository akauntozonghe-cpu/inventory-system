-- Additive-only foundation for immutable retirement records.
-- Does not move, delete, update, or change uniqueness on any active tables.
CREATE TABLE "ArchiveRecord" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedByUserId" TEXT,
    "reason" TEXT,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ArchiveRecord_entityType_originalId_key" ON "ArchiveRecord"("entityType", "originalId");
CREATE INDEX "ArchiveRecord_entityType_archivedAt_idx" ON "ArchiveRecord"("entityType", "archivedAt");

CREATE TABLE "ArchiveReRegistration" (
    "id" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "newEntityType" TEXT NOT NULL,
    "newEntityId" TEXT NOT NULL,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveReRegistration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArchiveReRegistration_newEntityType_newEntityId_idx" ON "ArchiveReRegistration"("newEntityType", "newEntityId");
CREATE INDEX "ArchiveReRegistration_archiveId_createdAt_idx" ON "ArchiveReRegistration"("archiveId", "createdAt");
ALTER TABLE "ArchiveReRegistration"
  ADD CONSTRAINT "ArchiveReRegistration_archiveId_fkey"
  FOREIGN KEY ("archiveId") REFERENCES "ArchiveRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
