import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";

function getText(value: unknown, maxLength = 300) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function getOptionalText(value: unknown, maxLength = 300) {
  return getText(value, maxLength) || null;
}

function getInteger(value: unknown) {
  const number = Number(value);

  return Number.isInteger(number) ? number : null;
}

function getAllocationType(value: unknown) {
  return value === "home" ||
    value === "flea_market" ||
    value === "warehouse"
    ? value
    : "home";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  try {
    const inventories = await prisma.inventoryInstance.findMany({
      include: {
        item: true,
        storageLocation: true,
        histories: {
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        },
        stocktakeRecords: {
          orderBy: {
            updatedAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return NextResponse.json(inventories);
  } catch (error) {
    console.error("GET /api/inventory", error);

    return NextResponse.json(
      {
        code: "INVENTORY_LIST_500",
        message: "在庫一覧を取得できませんでした。",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const adminUser = auth.user;

  if (!adminUser) {
    return NextResponse.json(
      {
        code: "ADMIN_REQUIRED",
        message: "この操作には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    const itemId = getText(body.itemId, 100);
    const quantity = getInteger(body.quantity);
    const storageLocationId = getOptionalText(
      body.storageLocationId,
      100
    );
    const lotNo = getOptionalText(body.lotNo, 100);
    const expirationDate = getOptionalText(
      body.expirationDate,
      30
    );
    const unit = getOptionalText(body.unit, 30);

    if (!itemId) {
      return NextResponse.json(
        {
          code: "INVENTORY_CREATE_ITEM_400",
          message: "商品を選択してください。",
        },
        { status: 400 }
      );
    }

    if (quantity === null || quantity < 0) {
      return NextResponse.json(
        {
          code: "INVENTORY_CREATE_QUANTITY_400",
          message: "数量は0以上の整数で入力してください。",
        },
        { status: 400 }
      );
    }

    const inventory = await prisma.$transaction(
      async (transaction) => {
        const item = await transaction.item.findUnique({
          where: { id: itemId },
        });

        if (!item) {
          throw new Error("INVENTORY_CREATE_ITEM_NOT_FOUND");
        }

        if (storageLocationId) {
          const location =
            await transaction.storageLocation.findUnique({
              where: { id: storageLocationId },
              select: { id: true },
            });

          if (!location) {
            throw new Error(
              "INVENTORY_CREATE_LOCATION_NOT_FOUND"
            );
          }
        }

        const existing =
          await transaction.inventoryInstance.findFirst({
            where: {
              itemId,
              storageLocationId,
              lotNo,
              expirationDate,
            },
          });

        if (existing) {
          const nextQuantity = existing.quantity + quantity;

          const updated =
            await transaction.inventoryInstance.update({
              where: { id: existing.id },
              data: {
                quantity: nextQuantity,
                actualQuantity: nextQuantity,
                unit: unit ?? existing.unit ?? item.defaultUnit,
                status: getText(body.status, 100) || "在庫中",
                allocationType: getAllocationType(
                  body.allocationType
                ),
              },
              include: {
                item: true,
                storageLocation: true,
              },
            });

          await transaction.inventoryHistory.create({
            data: {
              inventoryInstanceId: updated.id,
              changeQuantity: quantity,
              action: "在庫追加",
            },
          });

          return updated;
        }

        const created =
          await transaction.inventoryInstance.create({
            data: {
              itemId,
              storageLocationId,
              managementCode: item.managementCode,
              managementGroupCode:
                item.managementGroupCode,
              manufacturer: item.manufacturer,
              majorCategory: item.majorCategory,
              minorCategory: item.minorCategory,
              lotNo,
              expirationDate,
              unit: unit ?? item.defaultUnit,
              quantity,
              actualQuantity: quantity,
              allocationType: getAllocationType(
                body.allocationType
              ),
              status: getText(body.status, 100) || "在庫中",
              stocktakeStatus: "未棚卸",
            },
            include: {
              item: true,
              storageLocation: true,
            },
          });

        await transaction.inventoryHistory.create({
          data: {
            inventoryInstanceId: created.id,
            changeQuantity: quantity,
            action: "初回在庫登録",
          },
        });

        return created;
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      }
    );

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "INVENTORY_CREATE",
      route: "/api/inventory",
      detail: {
        inventoryInstanceId: inventory.id,
        itemId: inventory.itemId,
        itemName: inventory.item.name,
        quantity: inventory.quantity,
        storageLocationId:
          inventory.storageLocationId ?? "",
      },
    });

    return NextResponse.json(
      {
        success: true,
        inventory,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/inventory", error);

    const code = errorMessage(
      error,
      "INVENTORY_CREATE_500"
    );

    const messageByCode: Record<string, string> = {
      INVENTORY_CREATE_ITEM_NOT_FOUND:
        "選択した商品が見つかりません。",
      INVENTORY_CREATE_LOCATION_NOT_FOUND:
        "選択した保管場所が見つかりません。",
    };

    return NextResponse.json(
      {
        code,
        message:
          messageByCode[code] ??
          "在庫の登録に失敗しました。",
      },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const adminUser = auth.user;

  if (!adminUser) {
    return NextResponse.json(
      {
        code: "ADMIN_REQUIRED",
        message: "この操作には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    const id = getText(body.id, 100);
    const quantity = getInteger(body.quantity);
    const actualQuantity =
      body.actualQuantity === undefined ||
      body.actualQuantity === null ||
      body.actualQuantity === ""
        ? quantity
        : getInteger(body.actualQuantity);

    if (!id) {
      return NextResponse.json(
        {
          code: "INVENTORY_UPDATE_ID_400",
          message: "在庫IDが指定されていません。",
        },
        { status: 400 }
      );
    }

    if (quantity === null || quantity < 0) {
      return NextResponse.json(
        {
          code: "INVENTORY_UPDATE_QUANTITY_400",
          message: "数量は0以上の整数で入力してください。",
        },
        { status: 400 }
      );
    }

    if (
      actualQuantity === null ||
      actualQuantity === undefined ||
      actualQuantity < 0
    ) {
      return NextResponse.json(
        {
          code: "INVENTORY_UPDATE_ACTUAL_400",
          message:
            "実在庫数は0以上の整数で入力してください。",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(
      async (transaction) => {
        const before =
          await transaction.inventoryInstance.findUnique({
            where: { id },
            include: {
              item: {
                select: {
                  name: true,
                },
              },
            },
          });

        if (!before) {
          throw new Error("INVENTORY_UPDATE_NOT_FOUND");
        }

        const storageLocationId = getOptionalText(
          body.storageLocationId,
          100
        );

        if (storageLocationId) {
          const location =
            await transaction.storageLocation.findUnique({
              where: { id: storageLocationId },
              select: { id: true },
            });

          if (!location) {
            throw new Error(
              "INVENTORY_UPDATE_LOCATION_NOT_FOUND"
            );
          }
        }

        const inventory =
          await transaction.inventoryInstance.update({
            where: { id },
            data: {
              quantity,
              actualQuantity,
              storageLocationId,
              lotNo: getOptionalText(body.lotNo, 100),
              expirationDate: getOptionalText(
                body.expirationDate,
                30
              ),
              unit: getOptionalText(body.unit, 30),
              status:
                getText(body.status, 100) ||
                before.status,
              allocationType: getAllocationType(
                body.allocationType
              ),
            },
            include: {
              item: true,
              storageLocation: true,
            },
          });

        const difference = quantity - before.quantity;

        await transaction.inventoryHistory.create({
          data: {
            inventoryInstanceId: inventory.id,
            changeQuantity: difference,
            action:
              difference === 0
                ? "在庫情報修正"
                : "在庫数量修正",
          },
        });

        return {
          before,
          inventory,
          difference,
        };
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      }
    );

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "INVENTORY_UPDATE",
      route: "/api/inventory",
      detail: {
        inventoryInstanceId: updated.inventory.id,
        itemName: updated.inventory.item.name,
        beforeQuantity: updated.before.quantity,
        afterQuantity: updated.inventory.quantity,
        quantityDifference: updated.difference,
      },
    });

    return NextResponse.json({
      success: true,
      inventory: updated.inventory,
    });
  } catch (error) {
    console.error("PUT /api/inventory", error);

    const code = errorMessage(
      error,
      "INVENTORY_UPDATE_500"
    );

    const messageByCode: Record<string, string> = {
      INVENTORY_UPDATE_NOT_FOUND:
        "在庫が見つかりません。",
      INVENTORY_UPDATE_LOCATION_NOT_FOUND:
        "選択した保管場所が見つかりません。",
    };

    return NextResponse.json(
      {
        code,
        message:
          messageByCode[code] ??
          "在庫の更新に失敗しました。",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const adminUser = auth.user;

  if (!adminUser) {
    return NextResponse.json(
      {
        code: "AUTH_ADMIN_REQUIRED",
        message: "管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          code: "INVENTORY_ID_REQUIRED",
          message: "削除する在庫を指定してください。",
        },
        { status: 400 }
      );
    }

    const inventory = await prisma.inventoryInstance.findUnique({
      where: { id },
      include: {
        item: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            histories: true,
            stocktakeRecords: true,
            stocktakeTargets: true,
          },
        },
      },
    });

    if (!inventory) {
      return NextResponse.json(
        {
          code: "INVENTORY_NOT_FOUND",
          message: "在庫が見つかりません。",
        },
        { status: 404 }
      );
    }

    const isProtected =
      inventory._count.histories > 0 ||
      inventory._count.stocktakeRecords > 0 ||
      inventory._count.stocktakeTargets > 0;

    if (isProtected) {
      return NextResponse.json(
        {
          code: "INVENTORY_DELETE_AUDIT_PROTECTED",
          message:
            "履歴または棚卸記録がある在庫は削除できません。記録を残すため、数量修正またはステータス変更で対応してください。",
        },
        { status: 409 }
      );
    }

    await prisma.inventoryInstance.delete({
      where: { id },
    });

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "INVENTORY_DELETE",
      route: "/api/inventory",
      detail: {
        inventoryInstanceId: inventory.id,
        itemId: inventory.item.id,
        itemName: inventory.item.name,
        quantity: inventory.quantity,
      },
    });

    return NextResponse.json({
      success: true,
      message: "在庫を削除しました。",
    });
  } catch (error) {
    console.error("DELETE /api/inventory", error);

    return NextResponse.json(
      {
        code: "INVENTORY_DELETE_FAILED",
        message: "在庫の削除に失敗しました。",
      },
      { status: 500 }
    );
  }
}