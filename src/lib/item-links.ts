import type { Prisma } from "@prisma/client";

export type CommonFields = {
  majorCategory: string | null;
  minorCategory: string | null;
  manufacturer: string | null;
  defaultUnit: string | null;
};

/**
 * Item is the source of truth for shared catalog metadata.
 * - A null stock field inherits the current item value at read time.
 * - A stock field equal to the previous item value is a legacy copied/inherited value.
 * - A distinct stock value is an intentional per-lot override and is never overwritten.
 * All writes run inside the calling item's transaction, so screens cannot observe
 * a partially updated master/stock relation.
 *
 * Quantities, places, lots, expiry and historical stocktake snapshots are never touched.
 */
export async function syncItemLinks(
  tx: Prisma.TransactionClient,
  id: string,
  before: CommonFields,
  after: CommonFields,
) {
  const fields = [
    ["manufacturer", "manufacturer"],
    ["majorCategory", "majorCategory"],
    ["minorCategory", "minorCategory"],
    ["defaultUnit", "unit"],
  ] as const;

  for (const [itemField, stockField] of fields) {
    const oldValue = before[itemField];
    const newValue = after[itemField];
    if (oldValue === newValue || oldValue === null) continue;
    // Null means inheritance; leave it null. Only legacy copies of old
    // shared values are migrated, not independently configured stock fields.
    await tx.inventoryInstance.updateMany({
      where: { itemId: id, [stockField]: oldValue },
      data: { [stockField]: newValue },
    });
  }

  if (before.majorCategory !== after.majorCategory || before.minorCategory !== after.minorCategory) {
    await ensureClassification(tx, after.majorCategory, after.minorCategory);
  }
}

export async function ensureClassification(
  tx: Prisma.TransactionClient,
  major: string | null | undefined,
  minor: string | null | undefined,
) {
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
