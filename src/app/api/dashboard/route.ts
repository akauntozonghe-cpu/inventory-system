import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [
      totalItems,
      totalInventories,
      totalLocations,
      totalSessions,
      completedSessions,
      inventoryInstances,
      recentHistories,
    ] = await Promise.all([
      prisma.item.count(),

      prisma.inventoryInstance.aggregate({
        _sum: {
          quantity: true,
        },
      }),

      prisma.storageLocation.count(),

      prisma.stocktakeSession.count(),

      prisma.stocktakeSession.count({
        where: {
          status: "COMPLETED",
        },
      }),

      prisma.inventoryInstance.findMany(),

      prisma.inventoryHistory.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
        include: {
          inventoryInstance: {
            include: {
              item: true,
            },
          },
        },
      }),
    ]);

    const differenceCount =
      inventoryInstances.filter(
        (i) =>
          i.actualQuantity !== null &&
          i.actualQuantity !== i.quantity
      ).length;

    const expiredCount =
      inventoryInstances.filter((i) => {
        if (!i.expirationDate) return false;

        return (
          new Date(i.expirationDate) <
          new Date()
        );
      }).length;

    const shortageCount =
      inventoryInstances.filter(
        (i) => i.quantity <= 0
      ).length;

    const percent =
      totalSessions === 0
        ? 0
        : Math.round(
            (completedSessions /
              totalSessions) *
              100
          );

    return NextResponse.json({
      summary: {
        totalItems,

        totalInventories:
          totalInventories._sum.quantity ?? 0,

        totalLocations,
      },

      stocktake: {
        total: totalSessions,
        completed: completedSessions,
        percent,
      },

      alerts: {
        difference: differenceCount,
        expired: expiredCount,
        shortage: shortageCount,
      },

      recentHistories,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message:
          "ダッシュボード取得失敗",
      },
      {
        status: 500,
      }
    );
  }
}