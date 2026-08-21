import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";

function getText(value: unknown, maxLength = 200) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function getInteger(value: unknown) {
  const number = Number(value);

  return Number.isInteger(number) ? number : null;
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
        success: false,
        code: "ADMIN_REQUIRED",
        message: "この操作には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    const inventoryInstanceId = getText(
      body.inventoryInstanceId,
      100
    );
    const quantity = getInteger(body.quantity);
    const action =
      getText(body.action, 100) || "管理者による在庫修正";

    if (!inventoryInstanceId) {
      return NextResponse.json(
        {
          success: false,
          code: "INVENTORY_UPDATE_ID_REQUIRED",
          message: "在庫IDが指定されていません。",
        },
        { status: 400 }
      );
    }

    if (quantity === null || quantity < 0) {
      return NextResponse.json(
        {
          success: false,
          code: "INVENTORY_UPDATE_QUANTITY_INVALID",
          message: "数量は0以上の整数で入力してください。",
        },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(
      async (transaction) => {
        const before =
          await transaction.inventoryInstance.findUnique({
            where: {
              id: inventoryInstanceId,
            },
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

        if (!before) {
          throw new Error("INVENTORY_UPDATE_NOT_FOUND");
        }

        const updated =
          await transaction.inventoryInstance.update({
            where: {
              id: inventoryInstanceId,
            },
            data: {
              quantity,
              actualQuantity: quantity,
              stocktakeStatus: "未棚卸",
              stocktakeAt: null,
            },
            include: {
              item: true,
              storageLocation: true,
            },
          });

        await transaction.inventoryHistory.create({
          data: {
            inventoryInstanceId,
            changeQuantity: quantity - before.quantity,
            action,
          },
        });

        return {
          before,
          updated,
        };
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      }
    );

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "INVENTORY_QUANTITY_UPDATE",
      route: "/api/inventory/update",
      detail: {
        inventoryInstanceId,
        itemId: result.before.item.id,
        itemName: result.before.item.name,
        beforeQuantity: result.before.quantity,
        afterQuantity: result.updated.quantity,
        difference:
          result.updated.quantity - result.before.quantity,
        historyAction: action,
      },
    });

    return NextResponse.json({
      success: true,
      inventory: result.updated,
    });
  } catch (error) {
    console.error("POST /api/inventory/update", error);

    const code =
      error instanceof Error
        ? error.message
        : "INVENTORY_UPDATE_FAILED";

    return NextResponse.json(
      {
        success: false,
        code,
        message:
          code === "INVENTORY_UPDATE_NOT_FOUND"
            ? "在庫が見つかりません。"
            : "在庫の更新に失敗しました。",
      },
      { status: 400 }
    );
  }
}