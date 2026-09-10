import {activeInventoryWhere} from "@/lib/product-scope";
import { prisma } from "@/lib/prisma";

export class InventoryRepository {
  static async search(keyword: string) {
    return prisma.inventoryInstance.findMany({
      where: { ...activeInventoryWhere,
        OR: [{id:keyword},{itemId:keyword},{item:{systemBarcode:{contains:keyword,mode:"insensitive"}}},
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
