import { prisma } from "@/lib/prisma";

export class StocktakeRepository {
  static async createSession(data: {
    title: string;
    operator?: string;
  }) {
    return prisma.stocktakeSession.create({
      data: {
        title: data.title,
        operator: data.operator || "管理者",
        status: "IN_PROGRESS",
      },
    });
  }

  static async getSession(id: string) {
    return prisma.stocktakeSession.findUnique({
      where: {
        id,
      },
      include: {
        records: {
          include: {
            inventoryInstance: {
              include: {
                item: true,
                storageLocation: true,
              },
            },
          },
        },
      },
    });
  }

  static async getActiveSession() {
    return prisma.stocktakeSession.findFirst({
      where: {
        status: "IN_PROGRESS",
      },
      orderBy: {
        startedAt: "desc",
      },
    });
  }

  static async completeSession(id: string) {
    return prisma.stocktakeSession.update({
      where: {
        id,
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
  }
}