import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getLoggedInUser,
  hasAdminAccess,
} from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "RESULT_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    const session = await prisma.stocktakeSession.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        operator: true,
        operatorUserId: true,
        startedAt: true,
        completedAt: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          code: "RESULT_SESSION_404",
          message: "棚卸セッションが見つかりません。",
        },
        { status: 404 }
      );
    }

    const canView =
      session.operatorUserId === null ||
      session.operatorUserId === user.id ||
      hasAdminAccess(request);

    if (!canView) {
      return NextResponse.json(
        {
          code: "RESULT_FORBIDDEN",
          message: "この棚卸結果を閲覧する権限がありません。",
        },
        { status: 403 }
      );
    }

    const [targets, records] = await Promise.all([
      prisma.stocktakeTarget.findMany({
        where: { sessionId: id },
        orderBy: { createdAt: "asc" },
        select: {
          inventoryInstanceId: true,
          expectedQuantity: true,
          inventoryInstance: {
            select: {
              id: true,
              quantity: true,
              unit: true,
              lotNo: true,
              expirationDate: true,
              storageLocation: {
                select: {
                  name: true,
                },
              },
              item: {
                select: {
                  id: true,
                  name: true,
                  janCode: true,
                  systemBarcode: true,
                  managementCode: true,
                  managementGroupCode: true,
                  manufacturer: true,
                  majorCategory: true,
                  minorCategory: true,
                },
              },
            },
          },
        },
      }),

      prisma.stocktakeRecord.findMany({
        where: { sessionId: id },
        select: {
          inventoryInstanceId: true,
          countedQuantity: true,
          memo: true,
          updatedAt: true,
        },
      }),
    ]);

    const recordByInventoryId = new Map(
      records.map((record) => [
        record.inventoryInstanceId,
        record,
      ])
    );

    const items = targets.map((target) => {
      const record = recordByInventoryId.get(
        target.inventoryInstanceId
      );

      const countedQuantity =
        record?.countedQuantity ?? null;

      return {
        id: target.inventoryInstanceId,
        expectedQuantity: target.expectedQuantity,
        countedQuantity,
        difference:
          countedQuantity === null
            ? null
            : countedQuantity - target.expectedQuantity,
        memo: record?.memo ?? null,
        recordedAt: record?.updatedAt.toISOString() ?? null,

        location:
          target.inventoryInstance.storageLocation?.name ??
          "未設定",
        unit: target.inventoryInstance.unit,
        lotNo: target.inventoryInstance.lotNo,
        expirationDate:
          target.inventoryInstance.expirationDate,

        item: {
          id: target.inventoryInstance.item.id,
          name: target.inventoryInstance.item.name,
          janCode: target.inventoryInstance.item.janCode,
          systemBarcode:
            target.inventoryInstance.item.systemBarcode,
          managementCode:
            target.inventoryInstance.item.managementCode,
          managementGroupCode:
            target.inventoryInstance.item.managementGroupCode,
          manufacturer:
            target.inventoryInstance.item.manufacturer,
          majorCategory:
            target.inventoryInstance.item.majorCategory,
          minorCategory:
            target.inventoryInstance.item.minorCategory,
        },
      };
    });

    const recordedItems = items.filter(
      (item) => item.countedQuantity !== null
    );

    const matchedCount = recordedItems.filter(
      (item) => item.difference === 0
    ).length;

    const differenceCount = recordedItems.filter(
      (item) =>
        item.difference !== null &&
        item.difference !== 0
    ).length;

    return NextResponse.json({
      session: {
        id: session.id,
        title: session.title,
        status: session.status,
        operator: session.operator,
        startedAt: session.startedAt.toISOString(),
        completedAt:
          session.completedAt?.toISOString() ?? null,
        isOperator:
          session.operatorUserId === null ||
          session.operatorUserId === user.id,
      },
      summary: {
        targetCount: items.length,
        recordedCount: recordedItems.length,
        matchedCount,
        differenceCount,
        unrecordedCount:
          items.length - recordedItems.length,
      },
      items,
    });
  } catch (error) {
    console.error(
      "GET /api/stocktake/session/[id]/result",
      error
    );

    return NextResponse.json(
      {
        code: "RESULT_FETCH_500",
        message: "棚卸結果の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}