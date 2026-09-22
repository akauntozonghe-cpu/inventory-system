import type { Prisma } from "@prisma/client";

/** A barcode groups catalog information; inventory IDs identify separate stock. */
export async function findCatalogItem(tx: Prisma.TransactionClient, barcode: string | null | undefined) {
  if (!barcode) return null;
  // Serialize registration of the same barcode without merging existing stock.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catalog:${barcode}`}))`;
  return tx.item.findFirst({
    where: { isArchived: false, OR: [{ janCode: barcode }, { systemBarcode: barcode }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
