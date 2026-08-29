import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  InventoryEventType,
  NotificationAudience,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getLoggedInUser,
  hasAdminAccess,
  requireLogin,
} from "@/lib/auth";
import { databaseErrorCode, isRetryableDatabaseError, withDatabaseRetry } from "@/lib/database-retry";

type RegisterBody = {
  name?: unknown;
  janCode?: unknown;
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
  memo?: unknown;
  generateSystemBarcode?: unknown;
};

function requiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength: number) {
  return requiredText(value, maxLength) || null;
}

function validQuantity(value: unknown) {
  const quantity = Number(value);

  return Number.isInteger(quantity) && quantity >= 0 ? quantity : null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function createCheckDigit(base12: string) {
  const total = base12
    .split("")
    .reverse()
    .reduce((sum, digit, index) => {
      const value = Number(digit);

      return sum + value * (index % 2 === 0 ? 3 : 1);
    }, 0);

  return String((10 - (total % 10)) % 10);
}

async function createUniqueSystemBarcode() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const serial = String(randomInt(0, 10_000_000_000)).padStart(
      10,
      "0"
    );

    // 「20」から始まる、システム専用の13桁コード
    const base12 = `20${serial}`;
    const systemBarcode = `${base12}${createCheckDigit(base12)}`;

    const existing = await prisma.item.findUnique({
      where: {
        systemBarcode,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return systemBarcode;
    }
  }

  throw new Error("SYSTEM_BARCODE_GENERATE_FAILED");
}

export async function POST(request: NextRequest) {
  const login = requireLogin(request);

  if (login.response) {
    return login.response;
  }

  const currentUser = getLoggedInUser(request);

  if (!currentUser) {
    return NextResponse.json(
      {
        code: "AUTH_REQUIRED",
        message: "ログイン情報を確認できませんでした。",
      },
      {
        status: 401,
      }
    );
  }

  try {
    const rawBody: unknown = await request.json();

    if (typeof rawBody !== "object" || rawBody === null) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_BODY_INVALID",
          message: "登録内容が正しくありません。",
        },
        {
          status: 400,
        }
      );
    }

    const body = rawBody as RegisterBody;
    const canRegisterImmediately = hasAdminAccess(request);

    const name = requiredText(body.name, 200);
    const janCode = optionalText(body.janCode, 30);
    const managementCode = optionalText(body.managementCode, 100);
    const managementGroupCode = optionalText(
      body.managementGroupCode,
      100
    );
    const manufacturer = optionalText(body.manufacturer, 200);
    const majorCategory = optionalText(body.majorCategory, 100);
    const minorCategory = optionalText(body.minorCategory, 100);
    const unit = optionalText(body.unit, 30);
    const storageLocationId = optionalText(body.storageLocationId, 100);
    const lotNo = optionalText(body.lotNo, 100);
    const expirationDate = optionalText(body.expirationDate, 30);
    const memo = optionalText(body.memo, 500);
    const quantity = validQuantity(body.quantity);

    const generateSystemBarcode =
      body.generateSystemBarcode === true && canRegisterImmediately;

    if (!name) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_NAME_REQUIRED",
          message: "商品名を入力してください。",
        },
        {
          status: 400,
        }
      );
    }

    if (quantity === null) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_QUANTITY_INVALID",
          message: "数量は0以上の整数で入力してください。",
        },
        {
          status: 400,
        }
      );
    }

    if (body.generateSystemBarcode === true && !canRegisterImmediately) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_SYSTEM_BARCODE_FORBIDDEN",
          message: "システムバーコードの発行は管理者のみ実行できます。",
        },
        {
          status: 403,
        }
      );
    }

    // 管理者の直接登録では、JANまたはシステムバーコードが必須。
    // 一般ユーザーはJAN未確認でも申請でき、承認時に管理者が判断する。
    if (canRegisterImmediately && !janCode && !generateSystemBarcode) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_BARCODE_REQUIRED",
          message:
            "JANコードを入力するか、システムバーコードを発行してください。",
        },
        {
          status: 400,
        }
      );
    }

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
            code: "ITEM_REGISTER_LOCATION_NOT_FOUND",
            message: "指定された保管場所が見つかりません。",
          },
          {
            status: 400,
          }
        );
      }
    }

    if (janCode) {
      const existingJanItem = await prisma.item.findFirst({
        where: {
          janCode,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (existingJanItem) {
        return NextResponse.json(
          {
            code: "ITEM_REGISTER_JAN_DUPLICATE",
            message: `このJANコードは「${existingJanItem.name}」に登録されています。既存商品を確認してください。`,
            item: existingJanItem,
          },
          {
            status: 409,
          }
        );
      }
    }

    if (managementCode) {
      const existingManagementCode = await prisma.item.findUnique({
        where: {
          managementCode,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (existingManagementCode) {
        return NextResponse.json(
          {
            code: "ITEM_REGISTER_MANAGEMENT_CODE_DUPLICATE",
            message: `この管理番号は「${existingManagementCode.name}」に登録されています。`,
            item: existingManagementCode,
          },
          {
            status: 409,
          }
        );
      }
    }

    // 一般ユーザーは、商品マスタや在庫を直接変更せず申請を作成する。
    if (!canRegisterImmediately) {
      const requestRecord = await prisma.itemRegistrationRequest.create({
        data: {
          requestedByUserId: currentUser.id,
          scannedCode: janCode,
          name,
          manufacturer,
          managementCode,
          managementGroupCode,
          majorCategory,
          minorCategory,
          storageLocationId,
          quantity,
          unit,
          lotNo,
          expirationDate,
          memo,
        },
      });

      await prisma.notification.create({
        data: {
          type: NotificationType.REGISTRATION_REQUEST,
          audience: NotificationAudience.ADMIN,
          title: "商品登録の申請",
          message: `${currentUser.displayName}さんから「${name}」の登録申請があります。`,
          detail: jsonValue({
            requestId: requestRecord.id,
            requestedByUserId: currentUser.id,
            requestedByName: currentUser.displayName,
            name,
            janCode,
            quantity,
          }),
        },
      });

      return NextResponse.json(
        {
          success: true,
          mode: "REQUEST",
          message:
            "商品登録を申請しました。管理者の確認後に正式登録されます。",
          request: {
            id: requestRecord.id,
            status: requestRecord.status,
          },
        },
        {
          status: 201,
        }
      );
    }

    const systemBarcode = generateSystemBarcode
      ? await createUniqueSystemBarcode()
      : null;

    const result = await withDatabaseRetry(() => prisma.$transaction(
      async (transaction) => {
        const item = await transaction.item.create({
          data: {
            name,
            janCode,
            systemBarcode,
            managementCode,
            managementGroupCode,
            manufacturer,
            majorCategory,
            minorCategory,
            defaultUnit: unit,
          },
        });

        const inventory = await transaction.inventoryInstance.create({
          data: {
            itemId: item.id,
            storageLocationId,
            managementCode,
            managementGroupCode,
            manufacturer,
            majorCategory,
            minorCategory,
            lotNo,
            expirationDate,
            unit,
            quantity,
            actualQuantity: quantity,
            allocationType: "home",
            status: "在庫中",
            stocktakeStatus: "未棚卸",
          },
          include: {
            item: true,
            storageLocation: true,
          },
        });

        await transaction.inventoryHistory.create({
          data: {
            inventoryInstanceId: inventory.id,
            changeQuantity: quantity,
            action: "商品新規登録による初期在庫登録",
          },
        });

        await transaction.inventoryEvent.create({
          data: {
            inventoryInstanceId: inventory.id,
            eventType: InventoryEventType.OPENING_BALANCE,
            quantityBefore: 0,
            quantityChange: quantity,
            quantityAfter: quantity,
            reason: "商品新規登録時の初期在庫",
            memo,
            performedByUserId: currentUser.id,
            detail: jsonValue({
              source: "item_register",
              janCode,
              systemBarcode,
              generatedSystemBarcode: Boolean(systemBarcode),
            }),
          },
        });

        await transaction.adminActionLog.create({
          data: {
            adminUserId: currentUser.id,
            action: "ITEM_REGISTER",
            route: "/api/items/register",
            detail: jsonValue({
              itemId: item.id,
              inventoryInstanceId: inventory.id,
              itemName: item.name,
              janCode: item.janCode,
              systemBarcode: item.systemBarcode,
              quantity: inventory.quantity,
              storageLocationId: inventory.storageLocationId,
            }),
          },
        });

        return {
          item,
          inventory,
        };
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      }
    ));

    return NextResponse.json(
      {
        success: true,
        mode: "DIRECT",
        message: systemBarcode
          ? "商品を正式登録し、システムバーコードを発行しました。"
          : "商品と初期在庫を正式登録しました。",
        item: result.item,
        inventory: result.inventory,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("POST /api/items/register", error);

    if (isRetryableDatabaseError(error)) {
      return NextResponse.json(
        {
          code: `ITEM_REGISTER_DATABASE_UNAVAILABLE_${databaseErrorCode(error) ?? "UNKNOWN"}`,
          message: "データベースへ接続できませんでした。自動再試行でも復旧しなかったため、少し待ってからもう一度お試しください。",
          retryable: true,
        },
        { status: 503, headers: { "Retry-After": "5" } }
      );
    }

    const code =
      error instanceof Error &&
      error.message === "SYSTEM_BARCODE_GENERATE_FAILED"
        ? "ITEM_REGISTER_SYSTEM_BARCODE_GENERATE_FAILED"
        : "ITEM_REGISTER_FAILED";

    return NextResponse.json(
      {
        code,
        message:
          code === "ITEM_REGISTER_SYSTEM_BARCODE_GENERATE_FAILED"
            ? "システムバーコードを発行できませんでした。もう一度お試しください。"
            : "商品登録に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}
