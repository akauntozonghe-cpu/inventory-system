import type { Prisma } from "@prisma/client";

type CommonFields = { majorCategory: string | null; minorCategory: string | null; manufacturer: string | null; defaultUnit: string | null };

/** Product metadata is shared; quantities and deliberately different lot units are not converted. */
export async function syncItemLinks(tx: Prisma.TransactionClient, id: string, before: CommonFields, after: CommonFields) {
  const shared: Partial<Omit<CommonFields, "defaultUnit">> = {};
  for (const key of ["majorCategory", "minorCategory", "manufacturer"] as const) {
    if (before[key] !== after[key]) shared[key] = after[key];
  }
  if (Object.keys(shared).length) await tx.inventoryInstance.updateMany({ where: { itemId: id }, data: shared });
  if (before.defaultUnit !== after.defaultUnit) await tx.inventoryInstance.updateMany({
    where: { itemId: id, OR: [{ unit: before.defaultUnit }, { unit: null }, { unit: "0" }, { unit: "０" }] },
    data: { unit: after.defaultUnit },
  });
  await ensureClassification(tx, after.majorCategory, after.minorCategory);
}

export async function ensureClassification(tx: Prisma.TransactionClient, major: string | null | undefined, minor: string | null | undefined) {
  if (major) await tx.classification.upsert({ where: { kind_name_parentName: { kind: "MAJOR", name: major, parentName: "" } }, update: {}, create: { kind: "MAJOR", name: major, parentName: "" } });
  if (major && minor) await tx.classification.upsert({ where: { kind_name_parentName: { kind: "MINOR", name: minor, parentName: major } }, update: {}, create: { kind: "MINOR", name: minor, parentName: major } });
}
