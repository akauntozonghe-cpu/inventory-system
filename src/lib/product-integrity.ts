import { prisma } from "@/lib/prisma";

// Null-safe comparisons are essential: clearing a category is also a change.
export async function countProductLinkProblems() {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count FROM "InventoryInstance" AS inventory
    JOIN "Item" AS item ON item.id = inventory."itemId"
    WHERE inventory."majorCategory" IS DISTINCT FROM item."majorCategory"
       OR inventory."minorCategory" IS DISTINCT FROM item."minorCategory"
       OR inventory.manufacturer IS DISTINCT FROM item.manufacturer`;
  return Number(rows[0]?.count ?? 0);
}

export async function repairProductLinks(actorId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "InventoryInstance" AS inventory SET
        "majorCategory" = item."majorCategory", "minorCategory" = item."minorCategory",
        manufacturer = item.manufacturer, "updatedAt" = CURRENT_TIMESTAMP
      FROM "Item" AS item WHERE item.id = inventory."itemId" AND (
        inventory."majorCategory" IS DISTINCT FROM item."majorCategory" OR
        inventory."minorCategory" IS DISTINCT FROM item."minorCategory" OR
        inventory.manufacturer IS DISTINCT FROM item.manufacturer)`;
    const items = await tx.item.findMany({ select: { majorCategory: true, minorCategory: true } });
    const masters = new Map<string, { kind: string; name: string; parentName: string }>();
    for (const item of items) {
      if (item.majorCategory) masters.set(JSON.stringify(["MAJOR", item.majorCategory]), { kind: "MAJOR", name: item.majorCategory, parentName: "" });
      if (item.majorCategory && item.minorCategory) masters.set(JSON.stringify(["MINOR", item.majorCategory, item.minorCategory]), { kind: "MINOR", name: item.minorCategory, parentName: item.majorCategory });
    }
    if (masters.size) await tx.classification.createMany({ data: [...masters.values()], skipDuplicates: true });
    await tx.adminActionLog.create({ data: { adminUserId: actorId, action: "REPAIR_PRODUCT_LINKS", route: "/admin/system-check", detail: { updated, fields: ["majorCategory", "minorCategory", "manufacturer"], source: "Item" } } });
    return { updated };
  }, { timeout: 30000, isolationLevel: "Serializable" });
}
