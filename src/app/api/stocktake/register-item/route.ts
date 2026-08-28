import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser, hasAdminAccess } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";
import { resolveStocktakeRegistration } from "@/lib/stocktake-registration";

type RegisterItemBody = {
  sessionId?: unknown;
  name?: unknown;
  janCode?: unknown;
  systemBarcode?: unknown;
  managementCode?: unknown;
  managementGroupCode?: unknown;
  manufacturer?: unknown;
  majorCategory?: unknown;
  minorCategory?: unknown;
  unit?: unknown;
  storageLocationId?: unknown;
  quantity?: unknown;
  lotNo?: unknown;
  expirationDate?: unknown;
};

function getText(value: unknown, maxLength = 500) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function getOptionalText(value: unknown, maxLength = 500) {
  return getText(value, maxLength) || null;
}

function getQuantity(value: unknown) {
  const quantity = Number(value);

  return Number.isInteger(quantity) && quantity >= 0
    ? quantity
    : null;
}

function createSystemBarcode() {
  return `SYS-${randomUUID()
    .replace(/-/g, "")
    .slice(0, 18)
    .toUpperCase()}`;
}

function getErrorCode(error: unknown) {
  return error instanceof Error
    ? error.message
    : "REGISTER_ITEM_500";
}

export async function POST(request: NextRequest) {
  const actorUser = getLoggedInUser(request);

  if (!actorUser) {
    return NextResponse.json(
      {
        code: "REGISTER_ITEM_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  const liveUser = await prisma.appUser.findUnique({
    where: { id: actorUser.id },
    select: { isActive: true, featurePermissions: true },
  });

  if (
    !liveUser?.isActive ||
    (!hasAdminAccess(request) && !liveUser.featurePermissions.includes("ITEM_REGISTER"))
  ) {
    return NextResponse.json(
      {
        code: "REGISTER_ITEM_PERMISSION_403",
        message: "商品登録は管理者から許可されたユーザーのみ実行できます。",
      },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as RegisterItemBody;

    const sessionId = getText(body.sessionId, 100);
    const name = getText(body.name, 200);
    const janCode = getOptionalText(body.janCode, 30);
    const systemBarcode = getOptionalText(
      body.systemBarcode,
      100
    );
    const managementCode = getOptionalText(
      body.managementCode,
      100
    );
    const storageLocationId = getText(
      body.storageLocationId,
      100
    );
    const quantity = getQuantity(body.quantity);

    if (!sessionId) {
      return NextResponse.json(
        {
          code: "REGISTER_ITEM_SESSION_400",
          message: "棚卸セッションが指定されていません。",
        },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        {
          code: "REGISTER_ITEM_NAME_400",
          message: "商品名を入力してください。",
        },
        { status: 400 }
      );
    }

    if (!storageLocationId) {
      return NextResponse.json(
        {
          code: "REGISTER_ITEM_LOCATION_400",
          message: "保管場所を選択してください。",
        },
        { status: 400 }
      );
    }

    if (quantity === null) {
      return NextResponse.json(
        {
          code: "REGISTER_ITEM_QUANTITY_400",
          message: "在庫数は0以上の整数で入力してください。",
        },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(
      async (transaction) => {
        const session =
          await transaction.stocktakeSession.findUnique({
            where: {
              id: sessionId,
            },
            select: {
              id: true,
              title: true,
              status: true,
            },
          });

        if (!session) {
          throw new Error("REGISTER_ITEM_SESSION_NOT_FOUND");
        }

        if (session.status !== "IN_PROGRESS") {
          throw new Error("REGISTER_ITEM_SESSION_NOT_ACTIVE");
        }

        const location =
          await transaction.storageLocation.findUnique({
            where: {
              id: storageLocationId,
            },
            select: {
              id: true,
              name: true,
            },
          });

        if (!location) {
          throw new Error("REGISTER_ITEM_LOCATION_NOT_FOUND");
        }

        let item = null;
        let itemCreated = false;
        const manufacturer = getOptionalText(body.manufacturer, 200);
        const majorCategory = getOptionalText(body.majorCategory, 100);
        const minorCategory = getOptionalText(body.minorCategory, 100);
        const managementGroupCode = getOptionalText(
          body.managementGroupCode,
          100
        );

        if (managementCode) {
          item = await transaction.item.findUnique({
            where: {
              managementCode,
            },
          });
        }

        if (!item && janCode) {
          item = await transaction.item.findFirst({
            where: {
              janCode,
            },
            orderBy: {
              createdAt: "asc",
            },
          });
        }

        if (!item && systemBarcode) {
          item = await transaction.item.findUnique({
            where: {
              systemBarcode,
            },
          });
        }

        if (!item && !managementCode && !janCode && !systemBarcode) {
          item = await transaction.item.findFirst({
            where: {
              name: { equals: name, mode: "insensitive" },
              manufacturer,
              majorCategory,
              minorCategory,
              isArchived: false,
            },
            orderBy: { createdAt: "asc" },
          });
        }

        if (!item) {
          item = await transaction.item.create({
            data: {
              name,
              janCode,
              systemBarcode:
                systemBarcode ??
                (!janCode ? createSystemBarcode() : null),
              managementCode,
              managementGroupCode: getOptionalText(
                body.managementGroupCode,
                100
              ),
              manufacturer: getOptionalText(
                body.manufacturer,
                200
              ),
              majorCategory: getOptionalText(
                body.majorCategory,
                100
              ),
              minorCategory: getOptionalText(
                body.minorCategory,
                100
              ),
              defaultUnit: getOptionalText(body.unit, 30),
            },
          });

          itemCreated = true;
        }

        const lotNo = getOptionalText(body.lotNo, 100);
        const expirationDate = getOptionalText(
          body.expirationDate,
          30
        );
        const unit =
          getOptionalText(body.unit, 30) ?? item.defaultUnit;

        let inventory =
          await transaction.inventoryInstance.findFirst({
            where: {
              itemId: item.id,
              storageLocationId,
              lotNo,
              expirationDate,
            },
          });

        let inventoryCreated = false;
        const registration = resolveStocktakeRegistration(inventory, quantity);
        const { alreadyRegistered } = registration;

        if (!inventory) {
          inventory =
            await transaction.inventoryInstance.create({
              data: {
                itemId: item.id,
                storageLocationId,
                managementCode: item.managementCode,
                managementGroupCode:
                  item.managementGroupCode,
                manufacturer: item.manufacturer,
                majorCategory: item.majorCategory,
                minorCategory: item.minorCategory,
                lotNo,
                expirationDate,
                unit,
                quantity,
                actualQuantity: quantity,
                allocationType: "home",
                status: "保管中",
                stocktakeStatus: "棚卸済",
                stocktakeAt: new Date(),
              },
            });

          inventoryCreated = true;
        }

        if (inventoryCreated) {
          await transaction.inventoryHistory.create({
            data: {
              inventoryInstanceId: inventory.id,
              changeQuantity: quantity,
              action: "棚卸中の商品登録",
            },
          });
        }

        const target = await transaction.stocktakeTarget.upsert({
          where: {
            sessionId_inventoryInstanceId: {
              sessionId,
              inventoryInstanceId: inventory.id,
            },
          },
          update: {
            expectedQuantity: inventory.quantity,
          },
          create: {
            sessionId,
            inventoryInstanceId: inventory.id,
            expectedQuantity: inventory.quantity,
          },
          include: {
            inventoryInstance: {
              include: {
                item: true,
                storageLocation: true,
              },
            },
          },
        });

        const countedQuantity = registration.countedQuantity;

        await transaction.stocktakeRecord.upsert({
          where: {
            sessionId_inventoryInstanceId: {
              sessionId,
              inventoryInstanceId: inventory.id,
            },
          },
          update: alreadyRegistered
            ? {}
            : {
                countedQuantity,
                memo: "棚卸画面の商品登録時に自動記録",
              },
          create: {
            sessionId,
            inventoryInstanceId: inventory.id,
            countedQuantity,
            memo: alreadyRegistered
              ? "登録済み商品を確認"
              : "棚卸画面の商品登録時に自動記録",
          },
        });

        return {
          session,
          itemCreated,
          inventoryCreated,
          alreadyRegistered,
          target: {
            id: target.inventoryInstance.id,
            expectedQuantity: target.expectedQuantity,
            isRecorded: true,
            countedQuantity,
            alreadyRegistered,
            item: {
              id: target.inventoryInstance.item.id,
              name: target.inventoryInstance.item.name,
              janCode: target.inventoryInstance.item.janCode,
              systemBarcode:
                target.inventoryInstance.item.systemBarcode,
              managementCode:
                target.inventoryInstance.item.managementCode,
            },
            storageLocation:
              target.inventoryInstance.storageLocation
                ? {
                    id: target.inventoryInstance.storageLocation.id,
                    name: target.inventoryInstance.storageLocation.name,
                  }
                : null,
          },
          created: {
            itemId: item.id,
            inventoryInstanceId: inventory.id,
            locationName: location.name,
          },
        };
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      }
    );

    await createAdminActionLog({
      adminUserId: actorUser.id,
      action: "STOCKTAKE_REGISTER_UNLISTED_ITEM",
      route: "/api/stocktake/register-item",
      targetSessionId: sessionId,
      detail: {
        sessionTitle: result.session.title,
        itemId: result.created.itemId,
        inventoryInstanceId:
          result.created.inventoryInstanceId,
        itemName: result.target.item.name,
        janCode: result.target.item.janCode ?? "",
        systemBarcode:
          result.target.item.systemBarcode ?? "",
        quantity: result.target.expectedQuantity,
        locationName: result.created.locationName,
        itemCreated: result.itemCreated,
        inventoryCreated: result.inventoryCreated,
        alreadyRegistered: result.alreadyRegistered,
      },
    });

    return NextResponse.json(
      {
        success: true,
        code: result.alreadyRegistered
          ? "REGISTER_ITEM_ALREADY_REGISTERED"
          : "REGISTER_ITEM_CREATED_AND_COUNTED",
        message: result.alreadyRegistered
          ? "同じ商品・保管場所・ロットは登録済みです。既存データを表示します。"
          : "商品を登録し、棚卸済みとして記録しました。",
        ...result,
      },
      { status: result.alreadyRegistered ? 200 : 201 }
    );
  } catch (error) {
    console.error("POST /api/stocktake/register-item", error);

    const code = getErrorCode(error);

    const messages: Record<string, string> = {
      REGISTER_ITEM_SESSION_NOT_FOUND:
        "棚卸セッションが見つかりません。",
      REGISTER_ITEM_SESSION_NOT_ACTIVE:
        "棚卸中ではないため、新しい商品を追加できません。",
      REGISTER_ITEM_LOCATION_NOT_FOUND:
        "選択した保管場所が見つかりません。",
    };

    return NextResponse.json(
      {
        code,
        message:
          messages[code] ??
          "未登録商品の登録に失敗しました。",
      },
      { status: 400 }
    );
  }
}
