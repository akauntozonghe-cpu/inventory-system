import { prisma } from "@/lib/prisma";

type ItemInput = {
  name: string;
  janCode?: string;
  systemBarcode?: string;
  manufacturer?: string;
  managementCode?: string;
  managementGroupCode?: string;
  majorCategory?: string;
  minorCategory?: string;
  defaultUnit?: string;
};

type ItemUpdateInput = Partial<{
  name: string;
  janCode: string;
  systemBarcode: string;
  manufacturer: string;
  managementCode: string;
  managementGroupCode: string;
  majorCategory: string;
  minorCategory: string;
  defaultUnit: string;
}>;

export class ItemRepository {
  static async findAll() {
    return prisma.item.findMany({
      orderBy: {
        name: "asc",
      },
    });
  }

  static async create(data: ItemInput) {
    return prisma.item.create({
      data,
    });
  }

  static async update(id: string, data: ItemUpdateInput) {
    return prisma.item.update({
      where: {
        id,
      },
      data,
    });
  }

  static async delete(id: string) {
    return prisma.item.delete({
      where: {
        id,
      },
    });
  }

  static async search(keyword: string) {
    const query = keyword.trim();

    if (!query) {
      return [];
    }

    const items = await prisma.item.findMany({
      where: {
        OR: [
          {
            janCode: {
              equals: query,
              mode: "insensitive",
            },
          },
          {
            systemBarcode: {
              equals: query,
              mode: "insensitive",
            },
          },
          {
            managementCode: {
              equals: query,
              mode: "insensitive",
            },
          },
          {
            name: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            janCode: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            systemBarcode: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            managementCode: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            manufacturer: {
              contains: query,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: {
        name: "asc",
      },
      take: 50,
    });

    const normalizedQuery = query.toLowerCase();

    return items.sort((a, b) => {
      const score = (item: (typeof items)[number]) => {
        if (item.janCode?.toLowerCase() === normalizedQuery) {
          return 0;
        }

        if (item.systemBarcode?.toLowerCase() === normalizedQuery) {
          return 1;
        }

        if (item.managementCode?.toLowerCase() === normalizedQuery) {
          return 2;
        }

        if (item.name.toLowerCase() === normalizedQuery) {
          return 3;
        }

        return 10;
      };

      return score(a) - score(b);
    });
  }
}