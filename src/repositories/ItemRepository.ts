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

type ItemListOptions = {
  includeArchived?: boolean;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
}

function normalizeCode(value: string | null | undefined) {
  return normalizeText(value).replace(/[\s-]/g, "");
}

export class ItemRepository {
  static async findAll(options: ItemListOptions = {}) {
    return prisma.item.findMany({
      where: options.includeArchived ? undefined : { isArchived: false },
      orderBy: [{ isArchived: "asc" }, { name: "asc" }],
    });
  }

  static async create(data: ItemInput) {
    return prisma.item.create({
      data,
    });
  }

  static async update(id: string, data: ItemUpdateInput) {
    return prisma.item.update({
      where: { id },
      data,
    });
  }

  static async delete(id: string) {
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        janCode: true,
        systemBarcode: true,
        _count: {
          select: {
            inventoryInstances: true,
          },
        },
      },
    });

    if (!item) {
      throw new Error("削除する商品が見つかりません。");
    }

    if (item._count.inventoryInstances > 0) {
      return {
        deleted: false as const,
        item: {
          id: item.id,
          name: item.name,
          janCode: item.janCode,
          systemBarcode: item.systemBarcode,
        },
        inventoryCount: item._count.inventoryInstances,
      };
    }

    const deleted = await prisma.item.delete({
      where: { id },
      select: {
        id: true,
        name: true,
        janCode: true,
        systemBarcode: true,
      },
    });

    return {
      deleted: true as const,
      item: deleted,
      inventoryCount: 0,
    };
  }

  static async search(keyword: string, options: ItemListOptions = {}) {
    const query = keyword.trim();

    const items = await prisma.item.findMany({
      where: {
        AND: [
          ...(options.includeArchived ? [] : [{ isArchived: false }]),
          ...(query
            ? [
                {
                  OR: [
                    {
                      janCode: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      systemBarcode: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      managementCode: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      managementGroupCode: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      name: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      manufacturer: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      majorCategory: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      minorCategory: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      inventoryInstances: {
                        some: {
                          lotNo: {
                            contains: query,
                            mode: "insensitive" as const,
                          },
                        },
                      },
                    },
                    {
                      inventoryInstances: {
                        some: {
                          storageLocation: {
                            is: {
                              name: {
                                contains: query,
                                mode: "insensitive" as const,
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      include: {
        inventoryInstances: {
          include: {
            storageLocation: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        name: "asc",
      },
      take: 100,
    });

    const normalizedQuery = normalizeText(query);
    const normalizedCode = normalizeCode(query);

    return items
      .map((item) => {
        const locations = new Map<
          string,
          {
            name: string;
            quantity: number;
          }
        >();

        for (const inventory of item.inventoryInstances) {
          const name = inventory.storageLocation?.name ?? "未設定";
          const current = locations.get(name) ?? { name, quantity: 0 };

          current.quantity += inventory.quantity;
          locations.set(name, current);
        }

        const janCode = item.janCode ?? "";
        const systemBarcode = item.systemBarcode ?? "";
        const managementCode = item.managementCode ?? "";

        let score = 0;

        if (normalizedCode) {
          if (normalizeCode(janCode) === normalizedCode) score += 100;
          if (normalizeCode(systemBarcode) === normalizedCode) score += 90;
          if (normalizeCode(managementCode) === normalizedCode) score += 80;
        }

        if (normalizedQuery) {
          if (normalizeText(item.name).includes(normalizedQuery)) score += 50;
          if (normalizeText(item.manufacturer).includes(normalizedQuery)) score += 20;
          if (normalizeText(item.majorCategory).includes(normalizedQuery)) score += 15;
          if (normalizeText(item.minorCategory).includes(normalizedQuery)) score += 15;
        }

        return {
          ...item,
          score,
          totalQuantity: item.inventoryInstances.reduce(
            (sum, inventory) => sum + inventory.quantity,
            0
          ),
          locations: Array.from(locations.values()).sort((a, b) =>
            a.name.localeCompare(b.name, "ja")
          ),
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score || a.name.localeCompare(b.name, "ja")
      );
  }
}