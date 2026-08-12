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

function normalizeText(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
}

function normalizeCode(value: string | null | undefined) {
  return normalizeText(value).replace(/[\s-]/g, "");
}

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

    const items = await prisma.item.findMany({
      where: query
        ? {
            OR: [
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
                managementGroupCode: {
                  contains: query,
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
                manufacturer: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                majorCategory: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                minorCategory: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                inventoryInstances: {
                  some: {
                    lotNo: {
                      contains: query,
                      mode: "insensitive",
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
                          mode: "insensitive",
                        },
                      },
                    },
                  },
                },
              },
            ],
          }
        : undefined,
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

    const results = items.map((item) => {
      const locations = new Map<
        string,
        {
          name: string;
          quantity: number;
        }
      >();

      for (const inventory of item.inventoryInstances) {
        const name = inventory.storageLocation?.name ?? "未設定";
        const currentQuantity =
          inventory.actualQuantity ?? inventory.quantity;

        const previous = locations.get(name);

        locations.set(name, {
          name,
          quantity: (previous?.quantity ?? 0) + currentQuantity,
        });
      }

      const totalQuantity = [...locations.values()].reduce(
        (total, location) => total + location.quantity,
        0
      );

      const codes = [
        item.janCode,
        item.systemBarcode,
        item.managementCode,
      ].map(normalizeCode);

      let score = 0;

      if (query) {
        if (codes.some((code) => code === normalizedCode)) {
          score = 1000;
        } else if (
          normalizedCode.length >= 3 &&
          codes.some((code) => code.startsWith(normalizedCode))
        ) {
          score = 700;
        } else if (normalizeText(item.name) === normalizedQuery) {
          score = 500;
        } else if (
          [
            item.name,
            item.manufacturer,
            item.majorCategory,
            item.minorCategory,
            item.managementGroupCode,
            ...[...locations.values()].map((location) => location.name),
          ]
            .map(normalizeText)
            .some((value) => value.includes(normalizedQuery))
        ) {
          score = 100;
        }
      }

      return {
        id: item.id,
        name: item.name,
        janCode: item.janCode,
        systemBarcode: item.systemBarcode,
        managementCode: item.managementCode,
        managementGroupCode: item.managementGroupCode,
        manufacturer: item.manufacturer,
        majorCategory: item.majorCategory,
        minorCategory: item.minorCategory,
        defaultUnit: item.defaultUnit,
        totalQuantity,
        inventoryCount: item.inventoryInstances.length,
        locations: [...locations.values()].sort((left, right) =>
          left.name.localeCompare(right.name, "ja")
        ),
        score,
      };
    });

    return results
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if (right.totalQuantity !== left.totalQuantity) {
          return right.totalQuantity - left.totalQuantity;
        }

        return left.name.localeCompare(right.name, "ja");
      })
      .map(({ score: _score, ...item }) => item);
  }
}