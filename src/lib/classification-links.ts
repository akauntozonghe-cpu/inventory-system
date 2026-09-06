import type { Prisma } from "@prisma/client";

/** Keep issued QR codes resolving to the surviving master during rename/merge. */
export async function renameClassificationMaster(tx: Prisma.TransactionClient, kind: string, source: string, parentName: string, target: string, nextParent: string) {
  const from = await tx.classification.findUnique({ where: { kind_name_parentName: { kind, name: source, parentName } } });
  const to = await tx.classification.findUnique({ where: { kind_name_parentName: { kind, name: target, parentName: nextParent } } });
  if (from && to && from.id !== to.id) {
    await tx.classificationLabelAlias.updateMany({ where: { classificationId: from.id }, data: { classificationId: to.id } });
    await tx.classificationLabelAlias.upsert({ where: { labelCode: from.labelCode }, update: { classificationId: to.id }, create: { labelCode: from.labelCode, classificationId: to.id } });
    await tx.classification.delete({ where: { id: from.id } });
  } else if (from) {
    await tx.classification.update({ where: { id: from.id }, data: { name: target, parentName: nextParent } });
  } else if (!to) {
    await tx.classification.create({ data: { kind, name: target, parentName: nextParent } });
  }
}
