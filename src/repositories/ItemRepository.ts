import { prisma } from "@/lib/prisma";

export class ItemRepository {
  static async findAll() {
    return prisma.item.findMany({
      orderBy: {
        name: "asc",
      },
    });
  }

  static async create(data: {
    name: string;
    janCode?: string;
    manufacturer?: string;
    managementCode?: string;
    managementGroupCode?: string;
    majorCategory?: string;
    minorCategory?: string;
    defaultUnit?: string;
  }) {
    return prisma.item.create({
      data,
    });
  }

  static async update(
    id: string,
    data: Partial<{
      name: string;
      janCode: string;
      manufacturer: string;
      managementCode: string;
      managementGroupCode: string;
      majorCategory: string;
      minorCategory: string;
      defaultUnit: string;
    }>
  ) {
    return prisma.item.update({
      where: { id },
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
    return prisma.item.findMany({
      where: {
        OR: [
          {
            name: {
              contains: keyword,
              mode: "insensitive",
            },
          },
          {
            janCode: {
              contains: keyword,
              mode: "insensitive",
            },
          },
          {
            managementCode: {
              contains: keyword,
              mode: "insensitive",
            },
          },
          {
            manufacturer: {
              contains: keyword,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: {
        name: "asc",
      },
      take: 30,
    });
  }
}