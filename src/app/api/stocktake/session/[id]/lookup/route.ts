import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function normalizeCode(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s-]/g, "")
    .toLowerCase();
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id: sessionId } = await context.params;
    const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";

    if (!sessionId || !code) {
      return NextResponse.json(
        {
          code: "STOCKTAKE_LOOKUP_REQUIRED",
          message: "棚卸セッションまたはバーコードがありません。",
        },
        { status: 400 }
      );
    }

    // JAN・システムバーコード・管理コードをDBで直接検索する。
    // 同じJANのロット違い・保管場所違いは複数件のまま返す。
    const targets = await prisma.stocktakeTarget.findMany({
      where: {
        sessionId,
        OR: [
          {
            inventoryInstance: {
              is: {
                item: {
                  is: {
                    janCode: code,
                  },
                },
              },
            },
          },
          {
            inventoryInstance: {
              is: {
                item: {
                  is: {
                    systemBarcode: code,
                  },
                },
              },
            },
          },
          {
            inventoryInstance: {
              is: {
                item: {
                  is: {
                    managementCode: code,
                  },
                },
              },
            },
          },
          {
            inventoryInstance: {
              is: {
                managementCode: code,
              },
            },
          },
        ],
      },
      include: {
        inventoryInstance: {
          include: {
            item: true,
            storageLocation: true,
            stocktakeRecords: {
              where: {
                sessionId,
              },
              select: {
                countedQuantity: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const normalizedCode = normalizeCode(code);

    // DBにハイフン付きJANなどで保存されている古いデータにも対応する。
    // 通常は上の高速検索だけで完了する。
    const fallbackTargets =
      targets.length > 0
        ? targets
        : await prisma.stocktakeTarget.findMany({
            where: {
              sessionId,
            },
            include: {
              inventoryInstance: {
                include: {
                  item: true,
                  storageLocation: true,
                  stocktakeRecords: {
                    where: {
                      sessionId,
                    },
                    select: {
                      countedQuantity: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          });

    const results = fallbackTargets
      .map((target) => {
        const inventory = target.inventoryInstance;
        const record = inventory.stocktakeRecords[0];

        const codes = [
          inventory.item.janCode,
          inventory.item.systemBarcode,
          inventory.item.managementCode,
          inventory.managementCode,
        ].map(normalizeCode);

        if (!codes.includes(normalizedCode)) {
          return null;
        }

        return {
          id: inventory.id,
          expectedQuantity: target.expectedQuantity,
          countedQuantity: record?.countedQuantity ?? null,
          isRecorded: Boolean(record),
          lotNo: inventory.lotNo,
          expirationDate: inventory.expirationDate,
          unit: inventory.unit,
          stocktakeStatus: inventory.stocktakeStatus,
          stocktakeAt: inventory.stocktakeAt,
          updatedAt: inventory.updatedAt,
          item: inventory.item,
          storageLocation: inventory.storageLocation,
        };
      })
      .filter(
        (
          target
        ): target is NonNullable<typeof target> => target !== null
      );

    return NextResponse.json({
      code,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("STOCKTAKE_LOOKUP_500", error);

    return NextResponse.json(
      {
        code: "STOCKTAKE_LOOKUP_500",
        message: "バーコードの商品照合に失敗しました。",
      },
      { status: 500 }
    );
  }
}