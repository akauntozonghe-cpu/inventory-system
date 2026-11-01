import type { Prisma } from "@prisma/client";

type CommonFields = {
  majorCategory: string | null;
  minorCategory: string | null;
  manufacturer: string | null;
  defaultUnit: string | null;
};

/**
 * Item is the source of truth for shared product metadata.
 * Update stock values that inherit from (null) or still match the previous shared
 * value. Deliberate overrides, stocktake snapshots, transactions and deleted
 * inventory remain unchanged.
 */
export async function syncItemLinks(tx: Prisma.TransactionClient, id: string, before: CommonFields, after: CommonFields) {
  const active = { itemId: id, status: { not: "廃止" } };
  if (before.manufacturer !== after.manufacturer) {
    await tx.inventoryInstance.updateMany({
      where: { ...active, OR: [{ manufacturer: before.manufacturer }, { manufacturer: null }] },
      data: { manufacturer: after.manufacturer },
    });
  }
  if (before.defaultUnit !== after.defaultUnit) {
    await tx.inventoryInstance.updateMany({
      where: { ...active, OR: [{ unit: before.defaultUnit }, { unit: null }, { unit: "0" }, { unit: "０" }] },
      data: { unit: after.defaultUnit },
    });
  }
  if (before.majorCategory !== after.majorCategory) {
    // Do not overwrite a stock's different major category.
    await tx.inventoryInstance.updateMany({
      where: { ...active, OR: [{ majorCategory: before.majorCategory }, { majorCategory: null }] },
      data: { majorCategory: after.majorCategory },
    });
  }
  if (before.minorCategory !== after.minorCategory) {
    await tx.inventoryInstance.updateMany({
      where: {
        ...active,
        OR: [{ minorCategory: before.minorCategory }, { minorCategory: null }],
        // Only synchronize a minor category when the stock still belongs to
        // the product's major category, not a deliberately different category.
        majorCategory: after.majorCategory,
      },
      data: { minorCategory: after.minorCategory },
    });
  }
  await ensureClassification(tx, after.majorCategory, after.minorCategory);
}

export async function ensureClassification(tx: Prisma.TransactionClient, major: string | null | undefined, minor: string | null | undefined) {
  if (major) await tx.classification.upsert({ where: { kind_name_parentName: { kind: "MAJOR", name: major, parentName: "" } }, update: {}, create: { kind: "MAJOR", name: major, parentName: "" } });
  if (major && minor) await tx.classification.upsert({ where: { kind_name_parentName: { kind: "MINOR", name: minor, parentName: major } }, update: {}, create: { kind: "MINOR", name: minor, parentName: major } });
}
