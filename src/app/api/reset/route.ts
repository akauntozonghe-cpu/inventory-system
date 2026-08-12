import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";

const CONFIRMATION_TEXT = "RESET_ALL_INVENTORY_DATA";

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
    const body = await request.json().catch(() => null);

    if (body?.confirmation !== CONFIRMATION_TEXT) {
      return NextResponse.json(
        {
          success: false,
          code: "RESET_CONFIRMATION_REQUIRED",
          message:
            "初期化確認が一致しません。確認文字列を入力してください。",
          confirmationText: CONFIRMATION_TEXT,
        },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(
      async (transaction) => {
        const [
          sessionCount,
          recordCount,
          targetCount,
          historyCount,
          inventoryCount,
          itemCount,
          locationCount,
        ] = await Promise.all([
          transaction.stocktakeSession.count(),
          transaction.stocktakeRecord.count(),
          transaction.stocktakeTarget.count(),
          transaction.inventoryHistory.count(),
          transaction.inventoryInstance.count(),
          transaction.item.count(),
          transaction.storageLocation.count(),
        ]);

        await transaction.stocktakeRecord.deleteMany();
        await transaction.stocktakeTarget.deleteMany();
        await transaction.stocktakeSession.deleteMany();

        await transaction.inventoryHistory.deleteMany();
        await transaction.inventoryInstance.deleteMany();
        await transaction.item.deleteMany();
        await transaction.storageLocation.deleteMany();

        return {
          sessionCount,
          recordCount,
          targetCount,
          historyCount,
          inventoryCount,
          itemCount,
          locationCount,
        };
      },
      {
        maxWait: 10_000,
        timeout: 60_000,
      }
    );

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "SYSTEM_RESET_ALL_INVENTORY_DATA",
      route: "/api/reset",
      detail: result,
    });

    return NextResponse.json({
      success: true,
      message:
        "棚卸・在庫・商品・保管場所のデータを初期化しました。",
      deleted: result,
    });
  } catch (error) {
    console.error("POST /api/reset", error);

    return NextResponse.json(
      {
        success: false,
        code: "RESET_FAILED",
        message: "データ初期化に失敗しました。",
      },
      { status: 500 }
    );
  }
}