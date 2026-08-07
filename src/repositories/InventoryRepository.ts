import { prisma } from "@/lib/prisma";

export class InventoryRepository {
  static async search(keyword: string) {
    return prisma.inventoryInstance.findMany({
      where: {
        OR: [
          {
            item: {
              name: {
                contains: keyword,
                mode: "insensitive",
              },
            },
          },
          {
            item: {
              janCode: {
                contains: keyword,
                mode: "insensitive",
              },
            },
          },
          {
            item: {
              managementCode: {
                contains: keyword,
                mode: "insensitive",
              },
            },
          },
          {
            item: {
              manufacturer: {
                contains: keyword,
                mode: "insensitive",
              },
            },
          },
        ],
      },

      include: {
        item: true,
        storageLocation: true,
      },

      orderBy: {
        updatedAt: "desc",
      },

      take: 50,
    });
  }
}