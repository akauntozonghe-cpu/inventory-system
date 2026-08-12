import { randomInt } from "node:crypto";
import {
  InventoryEventType,
  NotificationAudience,
  NotificationType,
  Prisma,
  RegistrationRequestStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";

type ReviewAction = "APPROVE" | "REJECT";

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim().slice(0, maxLength) || null;
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

    const base12 = `20${serial}`;
    const systemBarcode = `${base12}${createCheckDigit(base12)}`;

    const existing = await prisma.item.findUnique({
      where: { systemBarcode },
      select: { id: true },
    });

    if (!existing) {
      return systemBarcode;
    }
  }

  throw new Error("SYSTEM_BARCODE_GENERATE_FAILED");
}

function isStatus(value: string | null): value is RegistrationRequestStatus {
  return (
    value === RegistrationRequestStatus.PENDING ||
    value === RegistrationRequestStatus.APPROVED ||
    value === RegistrationRequestStatus.REJECTED
  );
}

function isReviewAction(value: unknown): value is ReviewAction {
  return value === "APPROVE" || value === "REJECT";
}

export async function GET(request: NextRequest) {
  const authorization = requireAdmin(request);

  if (authorization.response) {
    return authorization.response;
  }

  const statusValue = request.nextUrl.searchParams.get("status");

  const status = isStatus(statusValue)
    ? statusValue
    : RegistrationRequestStatus.PENDING;

  try {
    const requests = await prisma.itemRegistrationRequest.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      include: {
        requestedBy: {
          select: {
            id: true,
            displayName: true,
            username: true,
          },
        },
        storageLocation: {
          select: {
            id: true,
            name: true,
          },
        },
        stocktakeSession: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      requests,
    });
  } catch (error) {
    console.error("GET /api/admin/registration-requests", error);

    return NextResponse.json(
      {
        code: "REGISTRATION_REQUEST_LIST_FAILED",
        message: "商品登録申請の一覧を取得できませんでした。",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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
      { status: 401 }
    );
  }

  try {
    const rawBody: unknown = await request.json();

    if (typeof rawBody !== "object" || rawBody === null) {
      return NextResponse.json(
        {
          code: "REGISTRATION_REQUEST_BODY_INVALID",
          message: "処理内容が正しくありません。",
        },
        { status: 400 }
      );
    }

    const body = rawBody as Record<string, unknown>;

    const requestId = optionalText(body.requestId, 100);
    const action = body.action;
    const reviewMemo = optionalText(body.reviewMemo, 500);

    // 管理者が承認時に修正できるJANコード
    const janCodeOverride = optionalText(body.janCode, 30);

    // JANがない商品の場合のみ管理者が選べる
    const generateSystemBarcode = body.generateSystemBarcode === true;

    if (!requestId) {
      return NextResponse.json(
        {
          code: "REGISTRATION_REQUEST_ID_REQUIRED",
          message: "商品登録申請を指定してください。",
        },
        { status: 400 }
      );
    }

    if (!isReviewAction(action)) {
      return NextResponse.json(
        {
          code: "REGISTRATION_REQUEST_ACTION_INVALID",
          message: "処理方法が正しくありません。",
        },
        { status: 400 }
      );
    }

    const registrationRequest =
      await prisma.itemRegistrationRequest.findUnique({
        where: { id: requestId },
        include: {
          requestedBy: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

    if (!registrationRequest) {
      return NextResponse.json(
        {
          code: "REGISTRATION_REQUEST_NOT_FOUND",
          message: "商品登録申請が見つかりませんでした。",
        },
        { status: 404 }
      );
    }

    if (registrationRequest.status !== RegistrationRequestStatus.PENDING) {
      return NextResponse.json(
        {
          code: "REGISTRATION_REQUEST_ALREADY_REVIEWED",
          message: "この商品登録申請はすでに処理されています。",
        },
        { status: 409 }
      );
    }

    if (action === "REJECT") {
      if (!reviewMemo) {
        return NextResponse.json(
          {
            code: "REGISTRATION_REQUEST_REJECT_REASON_REQUIRED",
            message: "差し戻す理由を入力してください。",
          },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (transaction) => {
        await transaction.itemRegistrationRequest.update({
          where: { id: registrationRequest.id },
          data: {
            status: RegistrationRequestStatus.REJECTED,
            reviewedByUserId: adminUser.id,
            reviewedAt: new Date(),
            reviewMemo,
          },
        });

        await transaction.notification.create({
          data: {
            type: NotificationType.REGISTRATION_REQUEST,
            audience: NotificationAudience.USER,
            recipientUserId: registrationRequest.requestedByUserId,
            title: "商品登録申請が差し戻されました",
            message: `「${registrationRequest.name}」の登録申請が差し戻されました。理由：${reviewMemo}`,
            detail: jsonValue({
              requestId: registrationRequest.id,
              status: "REJECTED",
              reviewedBy: adminUser.displayName,
            }),
          },
        });
      });

      await createAdminActionLog({
        adminUserId: adminUser.id,
        action: "ITEM_REGISTRATION_REQUEST_REJECT",
        route: "/api/admin/registration-requests",
        targetUserId: registrationRequest.requestedByUserId,
        targetSessionId:
          registrationRequest.stocktakeSessionId ?? undefined,
        detail: jsonValue({
          requestId: registrationRequest.id,
          itemName: registrationRequest.name,
          reviewMemo,
        }),
      });

      return NextResponse.json({
        success: true,
        message: "商品登録申請を差し戻しました。",
      });
    }

    // 優先順位：管理者が入力したJAN → 申請時のJAN → システムバーコード
    const finalJanCode = janCodeOverride ?? registrationRequest.scannedCode;

    if (!finalJanCode && !generateSystemBarcode) {
      return NextResponse.json(
        {
          code: "REGISTRATION_REQUEST_BARCODE_REQUIRED",
          message:
            "JANコードを入力するか、システムバーコードを発行してください。",
        },
        { status: 400 }
      );
    }

    if (finalJanCode && generateSystemBarcode) {
      return NextResponse.json(
        {
          code: "REGISTRATION_REQUEST_BARCODE_CONFLICT",
          message:
            "JANコードとシステムバーコードは同時に設定できません。",
        },
        { status: 400 }
      );
    }

    if (finalJanCode) {
      const duplicateJan = await prisma.item.findFirst({
        where: { janCode: finalJanCode },
        select: {
          id: true,
          name: true,
        },
      });

      if (duplicateJan) {
        return NextResponse.json(
          {
            code: "REGISTRATION_REQUEST_JAN_DUPLICATE",
            message: `このJANコードは「${duplicateJan.name}」に登録されています。既存商品を確認してください。`,
            itemId: duplicateJan.id,
          },
          { status: 409 }
        );
      }
    }

    if (registrationRequest.managementCode) {
      const duplicateManagementCode = await prisma.item.findUnique({
        where: {
          managementCode: registrationRequest.managementCode,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (duplicateManagementCode) {
        return NextResponse.json(
          {
            code: "REGISTRATION_REQUEST_MANAGEMENT_CODE_DUPLICATE",
            message: `この管理番号は「${duplicateManagementCode.name}」に登録されています。`,
            itemId: duplicateManagementCode.id,
          },
          { status: 409 }
        );
      }
    }

    const systemBarcode = generateSystemBarcode
      ? await createUniqueSystemBarcode()
      : null;

    const result = await prisma.$transaction(
      async (transaction) => {
        const item = await transaction.item.create({
          data: {
            name: registrationRequest.name,
            janCode: finalJanCode,
            systemBarcode,
            managementCode: registrationRequest.managementCode,
            managementGroupCode:
              registrationRequest.managementGroupCode,
            manufacturer: registrationRequest.manufacturer,
            majorCategory: registrationRequest.majorCategory,
            minorCategory: registrationRequest.minorCategory,
            defaultUnit: registrationRequest.unit,
          },
        });

        const inventory = await transaction.inventoryInstance.create({
          data: {
            itemId: item.id,
            storageLocationId:
              registrationRequest.storageLocationId,
            managementCode: item.managementCode,
            managementGroupCode: item.managementGroupCode,
            manufacturer: item.manufacturer,
            majorCategory: item.majorCategory,
            minorCategory: item.minorCategory,
            lotNo: registrationRequest.lotNo,
            expirationDate: registrationRequest.expirationDate,
            unit: registrationRequest.unit,
            quantity: registrationRequest.quantity,
            actualQuantity: registrationRequest.quantity,
            allocationType: "home",
            status: "在庫中",
            stocktakeStatus: "未棚卸",
          },
        });

        await transaction.inventoryHistory.create({
          data: {
            inventoryInstanceId: inventory.id,
            changeQuantity: registrationRequest.quantity,
            action: "商品登録申請の承認による初期在庫登録",
          },
        });

        await transaction.inventoryEvent.create({
          data: {
            inventoryInstanceId: inventory.id,
            eventType: InventoryEventType.OPENING_BALANCE,
            quantityBefore: 0,
            quantityChange: registrationRequest.quantity,
            quantityAfter: registrationRequest.quantity,
            reason: "商品登録申請の承認",
            memo: reviewMemo ?? registrationRequest.memo,
            performedByUserId: adminUser.id,
            stocktakeSessionId:
              registrationRequest.stocktakeSessionId,
            detail: jsonValue({
              requestId: registrationRequest.id,
              requestedByUserId:
                registrationRequest.requestedByUserId,
              originalJanCode: registrationRequest.scannedCode,
              finalJanCode,
              systemBarcode,
            }),
          },
        });

        await transaction.itemRegistrationRequest.update({
          where: { id: registrationRequest.id },
          data: {
            status: RegistrationRequestStatus.APPROVED,
            reviewedByUserId: adminUser.id,
            reviewedAt: new Date(),
            reviewMemo,
            createdItemId: item.id,
            createdInventoryInstanceId: inventory.id,
          },
        });

        await transaction.notification.create({
          data: {
            type: NotificationType.REGISTRATION_REQUEST,
            audience: NotificationAudience.USER,
            recipientUserId: registrationRequest.requestedByUserId,
            stocktakeSessionId:
              registrationRequest.stocktakeSessionId,
            title: "商品登録申請が承認されました",
            message: `「${item.name}」を正式登録しました。`,
            detail: jsonValue({
              requestId: registrationRequest.id,
              itemId: item.id,
              inventoryInstanceId: inventory.id,
              janCode: item.janCode,
              systemBarcode: item.systemBarcode,
            }),
          },
        });

        return { item, inventory };
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      }
    );

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "ITEM_REGISTRATION_REQUEST_APPROVE",
      route: "/api/admin/registration-requests",
      targetUserId: registrationRequest.requestedByUserId,
      targetSessionId:
        registrationRequest.stocktakeSessionId ?? undefined,
      detail: jsonValue({
        requestId: registrationRequest.id,
        itemId: result.item.id,
        inventoryInstanceId: result.inventory.id,
        itemName: result.item.name,
        originalJanCode: registrationRequest.scannedCode,
        finalJanCode: result.item.janCode,
        systemBarcode: result.item.systemBarcode,
        quantity: result.inventory.quantity,
        reviewMemo,
      }),
    });

    return NextResponse.json({
      success: true,
      message: result.item.systemBarcode
        ? "商品を正式登録し、システムバーコードを発行しました。"
        : "商品を正式登録しました。",
      item: result.item,
      inventory: result.inventory,
    });
  } catch (error) {
    console.error("PATCH /api/admin/registration-requests", error);

    if (
      error instanceof Error &&
      error.message === "SYSTEM_BARCODE_GENERATE_FAILED"
    ) {
      return NextResponse.json(
        {
          code: "REGISTRATION_REQUEST_SYSTEM_BARCODE_FAILED",
          message:
            "システムバーコードを発行できませんでした。もう一度お試しください。",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        code: "REGISTRATION_REQUEST_REVIEW_FAILED",
        message: "商品登録申請を処理できませんでした。",
      },
      { status: 500 }
    );
  }
}