import type { Prisma } from "@prisma/client";

export type CommonFields = {
  majorCategory: string | null;
  minorCategory: string | null;
  manufacturer: string | null;
  defaultUnit: string | null;
};

/**
 * Item is authoritative for shared metadata; stock-specific overrides win.
 * Null stock values continue to inherit at read-time.
 * Values copied from a prior item master are migrated when that master changes.
 * Never rewrite stocktake snapshots, quantities, movement logs or deleted stock.
 */
export async function syncItemLinks(tx: Prisma.TransactionClient, id: string, before: CommonFields, after: CommonFields) {
  const active = { itemId: id, status: { not: "廃止" } } as const;
  if (before.manufacturer !== after.manufacturer && before.manufacturer !== null) {
    await tx.inventoryInstance.updateMany({
      where: { ...active, manufacturer: before.manufacturer },
      data: { manufacturer: after.manufacturer },
    });
  }
  if (before.defaultUnit !== after.defaultUnit && before.defaultUnit !== null) {
    await tx.inventoryInstance.updateMany({
      where: { ...active, unit: before.defaultUnit },
      data: { unit: after.defaultUnit },
    });
  }
  if (before.majorCategory !== after.majorCategory && before.majorCategory !== null) {
    await tx.inventoryInstance.updateMany({
      where: { ...active, majorCategory: before.majorCategory },
      data: { majorCategory: after.majorCategory },
    });
  }
  if (before.minorCategory !== after.minorCategory && before.minorCategory !== null) {
    await tx.inventoryInstance.updateMany({
      where: {
        ...active,
        minorCategory: before.minorCategory,
        OR: [
          { majorCategory: before.majorCategory },
          { majorCategory: after.majorCategory },
          { majorCategory: null },
        ],
      },
      data: { minorCategory: after.minorCategory },
    });
  }
  if (before.majorCategory !== after.majorCategory || before.minorCategory !== after.minorCategory) {
    await ensureClassification(tx, after.majorCategory, after.minorCategory);
  }
}

export async function ensureClassification(tx: Prisma.TransactionClient, major: string | null | undefined, minor: string | null | undefined) {
  if (major) await tx.classification.upsert({
    where: { kind_name_parentName: { kind: "MAJOR", name: major, parentName: "" } },
    update: {},
    create: { kind: "MAJOR", name: major, parentName: "" },
  });
  if (major && minor) await tx.classification.upsert({
    where: { kind_name_parentName: { kind: "MINOR", name: minor, parentName: major } },
    update: {},
    create: { kind: "MINOR", name: minor, parentName: major },
  });
}
