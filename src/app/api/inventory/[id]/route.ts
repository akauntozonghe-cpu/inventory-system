import { NextRequest, NextResponse } from "next/server";
import {
  AllocationType,
  InventoryEventType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireLogin } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function emptyToNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isAllocationType(value: unknown): value is AllocationType {
  return (
    value === AllocationType.home ||
    value === AllocationType.flea_market ||
    value === AllocationType.warehouse
  );
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const login = requireLogin(request);

  if (login.response) {
    return login.response;
  }

  const { id } = await context.params;

  const inventory = await prisma.inventoryInstance.findUnique({
    where: {
      id,
    },
    include: {
      item: true,
      storageLocation: true,
      histories: {
        orderBy: {
          createdAt: "desc",
        },
        take: 30,
      },
      inventoryEvents: {
        orderBy: {
          createdAt: "desc",
        },
        take: 30,
        include: {
          performedBy: {
            select: {
              id: true,
              displayName: true,
              username: true,
            },
          },
          stocktakeSession: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
  });

  if (!inventory) {
    return NextResponse.json(
      {
        code: "INVENTORY_NOT_FOUND",
        message: "在庫明細が見つかりませんでした。",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    inventory,
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const authorization = requireAdmin(request);

  if (authorization.response) {
    return authorization.response;
  }

  const adminUser = authorization.user;

  if (!adminUser) {
    return NextResponse.json(
      {
        code: "ADMIN_AUTH_INVALID",
        message: "管理者情報を確認できませんでした。",
      },
      {
        status: 401,
      }
    );
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      storageLocationId?: string | null;
      managementCode?: string | null;
      managementGroupCode?: string | null;
      manufacturer?: string | null;
      majorCategory?: string | null;
      minorCategory?: string | null;
      lotNo?: string | null;
      expirationDate?: string | null;
      unit?: string | null;
      quantity?: number;
      actualQuantity?: number | null;
      allocationType?: AllocationType;
      status?: string;
      stocktakeStatus?: string;
      reason?: string;
      memo?: string;
    };

    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
      return NextResponse.json(
        {
          code: "INVENTORY_EDIT_REASON_REQUIRED",
          message: "変更理由を入力してください。",
        },
        {
          status: 400,
        }
      );
    }

    if (
      body.quantity !== undefined &&
      (!Number.isInteger(body.quantity) || body.quantity < 0)
    ) {
      return NextResponse.json(
        {
          code: "INVENTORY_QUANTITY_INVALID",
          message: "在庫数は0以上の整数で入力してください。",
        },
        {
          status: 400,
        }
      );
    }

    if (
      body.actualQuantity !== undefined &&
      body.actualQuantity !== null &&
      (!Number.isInteger(body.actualQuantity) ||
        body.actualQuantity < 0)
    ) {
      return NextResponse.json(
        {
          code: "INVENTORY_ACTUAL_QUANTITY_INVALID",
          message: "実在庫数は0以上の整数で入力してください。",
        },
        {
          status: 400,
        }
      );
    }

    if (
      body.allocationType !== undefined &&
      !isAllocationType(body.allocationType)
    ) {
      return NextResponse.json(
        {
          code: "INVENTORY_ALLOCATION_TYPE_INVALID",
          message: "割当区分が正しくありません。",
        },
        {
          status: 400,
        }
      );
    }

    const existing = await prisma.inventoryInstance.findUnique({
      where: {
        id,
      },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            janCode: true,
            systemBarcode: true,
          },
        },
        storageLocation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          code: "INVENTORY_NOT_FOUND",
          message: "在庫明細が見つかりませんでした。",
        },
        {
          status: 404,
        }
      );
    }

    const storageLocationId =
      body.storageLocationId === undefined
        ? existing.storageLocationId
        : emptyToNull(body.storageLocationId);

    if (storageLocationId) {
      const location = await prisma.storageLocation.findUnique({
        where: {
          id: storageLocationId,
        },
        select: {
          id: true,
        },
      });

      if (!location) {
        return NextResponse.json(
          {
            code: "INVENTORY_LOCATION_NOT_FOUND",
            message: "指定された保管場所が見つかりませんでした。",
          },
          {
            status: 400,
          }
        );
      }
    }

    const quantity =
      body.quantity === undefined ? existing.quantity : body.quantity;

    const actualQuantity =
      body.actualQuantity === undefined
        ? existing.actualQuantity
        : body.actualQuantity;

    const updateData: Prisma.InventoryInstanceUpdateInput = {
      storageLocation: storageLocationId
        ? {
            connect: {
              id: storageLocationId,
            },
          }
        : {
            disconnect: true,
          },
      managementCode:
        body.managementCode === undefined
          ? existing.managementCode
          : emptyToNull(body.managementCode),
      managementGroupCode:
        body.managementGroupCode === undefined
          ? existing.managementGroupCode
          : emptyToNull(body.managementGroupCode),
      manufacturer:
        body.manufacturer === undefined
          ? existing.manufacturer
          : emptyToNull(body.manufacturer),
      majorCategory:
        body.majorCategory === undefined
          ? existing.majorCategory
          : emptyToNull(body.majorCategory),
      minorCategory:
        body.minorCategory === undefined
          ? existing.minorCategory
          : emptyToNull(body.minorCategory),
      lotNo:
        body.lotNo === undefined
          ? existing.lotNo
          : emptyToNull(body.lotNo),
      expirationDate:
        body.expirationDate === undefined
          ? existing.expirationDate
          : emptyToNull(body.expirationDate),
      unit:
        body.unit === undefined
          ? existing.unit
          : emptyToNull(body.unit),
      quantity,
      actualQuantity,
      allocationType:
        body.allocationType === undefined
          ? existing.allocationType
          : body.allocationType,
      status:
        body.status === undefined
          ? existing.status
          : body.status.trim() || existing.status,
      stocktakeStatus:
        body.stocktakeStatus === undefined
          ? existing.stocktakeStatus
          : body.stocktakeStatus.trim() || existing.stocktakeStatus,
    };

    const before = {
      quantity: existing.quantity,
      actualQuantity: existing.actualQuantity,
      storageLocationId: existing.storageLocationId,
      managementCode: existing.managementCode,
      managementGroupCode: existing.managementGroupCode,
      manufacturer: existing.manufacturer,
      majorCategory: existing.majorCategory,
      minorCategory: existing.minorCategory,
      lotNo: existing.lotNo,
      expirationDate: existing.expirationDate,
      unit: existing.unit,
      allocationType: existing.allocationType,
      status: existing.status,
      stocktakeStatus: existing.stocktakeStatus,
    };

    const result = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.inventoryInstance.update({
        where: {
          id,
        },
        data: updateData,
        include: {
          item: true,
          storageLocation: true,
        },
      });

      const quantityChanged = existing.quantity !== updated.quantity;

      if (quantityChanged) {
        const difference = updated.quantity - existing.quantity;

        await transaction.inventoryHistory.create({
          data: {
            inventoryInstanceId: updated.id,
            changeQuantity: difference,
            action: `管理者在庫修正: ${reason}`,
          },
        });

        await transaction.inventoryEvent.create({
          data: {
            inventoryInstanceId: updated.id,
            eventType: InventoryEventType.ADJUSTMENT,
            quantityBefore: existing.quantity,
            quantityChange: difference,
            quantityAfter: updated.quantity,
            reason,
            memo: emptyToNull(body.memo),
            performedByUserId: adminUser.id,
            detail: toJsonValue({
              source: "admin_inventory_edit",
              inventoryInstanceId: updated.id,
              itemName: updated.item.name,
            }),
          },
        });
      }

      return updated;
    });

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "INVENTORY_UPDATE",
      route: `/api/inventory/${id}`,
      detail: toJsonValue({
        reason,
        memo: emptyToNull(body.memo),
        inventoryInstanceId: id,
        itemName: existing.item.name,
        before,
        after: {
          quantity: result.quantity,
          actualQuantity: result.actualQuantity,
          storageLocationId: result.storageLocationId,
          managementCode: result.managementCode,
          managementGroupCode: result.managementGroupCode,
          manufacturer: result.manufacturer,
          majorCategory: result.majorCategory,
          minorCategory: result.minorCategory,
          lotNo: result.lotNo,
          expirationDate: result.expirationDate,
          unit: result.unit,
          allocationType: result.allocationType,
          status: result.status,
          stocktakeStatus: result.stocktakeStatus,
        },
      }),
    });

    return NextResponse.json({
      success: true,
      message: "在庫明細を更新しました。",
      inventory: result,
    });
  } catch (error) {
    console.error(error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          code: "INVENTORY_DUPLICATE",
          message:
            "同じ商品・保管場所・ロット・使用期限の在庫明細が既に存在します。",
        },
        {
          status: 409,
        }
      );
    }

    return NextResponse.json(
      {
        code: "INVENTORY_UPDATE_FAILED",
        message: "在庫明細を更新できませんでした。",
      },
      {
        status: 500,
      }
    );
  }
}