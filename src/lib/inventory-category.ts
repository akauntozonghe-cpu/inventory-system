import type { Prisma } from "@prisma/client";

/** Legacy null classifications inherit the catalog; explicit stock values take priority. */
export function inventoryCategoryWhere(field: "majorCategory" | "minorCategory", value: string): Prisma.InventoryInstanceWhereInput {
  return { OR: [
    { [field]: value },
    { [field]: null, item: { is: { [field]: value } } },
  ] };
}
