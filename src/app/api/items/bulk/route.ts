import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type BulkOperation = "ARCHIVE" | "RESTORE";

type BulkItemRequest = {
  operation?: unknown;
  itemIds?: unknown;
  reason?: unknown;
};

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
      )
    )
  );
}

function isBulkOperation(value: unknown): value is BulkOperation {
  return value === "ARCHIVE" || value === "RESTORE";
}

function toJsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      success: false,
      code,
      message,
    },
    { status }
  );
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const adminUser = auth.user;

  if (!adminUser) {
    return toJsonError(
      "ITEM_BULK_ADMIN_REQUIRED",
      "この操作には管理者権限が必要です。",
      403
    );
  }

  try {
    const body = (await request.json()) as BulkItemRequest;
    const operation = body.operation;
    const itemIds = uniqueIds(body.itemIds);
    const reason = asTrimmedString(body.reason);

    if (!isBulkOperation(operation)) {
      return toJsonError(
        "ITEM_BULK_OPERATION_INVALID",
        "実行する操作を正しく指定してください。",
        400
      );
    }

    if (itemIds.length === 0) {
      return toJsonError(
        "ITEM_BULK_ITEMS_EMPTY",
        "対象の商品を1件以上選択してください。",
        400
      );
    }

    if (itemIds.length > 1000) {
      return toJsonError(
        "ITEM_BULK_TOO_MANY_ITEMS",
        "一度に操作できる商品は1,000件までです。絞り込み条件を分けて実行してください。",
        400
      );
    }

    if (reason.length < 2) {
      return toJsonError(
        "ITEM_BULK_REASON_REQUIRED",
        "廃止・復帰する理由を2文字以上で入力してください。",
        400
      );
    }

    const targetItems = await prisma.item.findMany({
      where: {
        id: {
          in: itemIds,
        },
      },
      select: {
        id: true,
        name: true,
        isArchived: true,
      },
    });

    if (targetItems.length === 0) {
      return toJsonError(
        "ITEM_BULK_TARGET_NOT_FOUND",
        "操作対象の商品が見つかりません。",
        404
      );
    }

    const targetIds = targetItems.map((item) => item.id);

    const result =
      operation === "ARCHIVE"
        ? await prisma.item.updateMany({
            where: {
              id: {
                in: targetIds,
              },
              isArchived: false,
            },
            data: {
              isArchived: true,
              archivedAt: new Date(),
              archiveReason: reason,
            },
          })
        : await prisma.item.updateMany({
            where: {
              id: {
                in: targetIds,
              },
              isArchived: true,
            },
            data: {
              isArchived: false,
              archivedAt: null,
              archiveReason: null,
            },
          });

    await prisma.adminActionLog.create({
      data: {
        adminUserId: adminUser.id,
        action:
          operation === "ARCHIVE" ? "ITEM_BULK_ARCHIVE" : "ITEM_BULK_RESTORE",
        route: "/api/items/bulk",
        detail: {
          operation,
          reason,
          requestedCount: itemIds.length,
          foundCount: targetItems.length,
          affectedCount: result.count,
          itemIds: targetIds,
          itemNames: targetItems.map((item) => item.name),
        },
      },
    });

    const actionLabel = operation === "ARCHIVE" ? "廃止" : "復帰";

    return NextResponse.json({
      success: true,
      code:
        operation === "ARCHIVE"
          ? "ITEM_BULK_ARCHIVE_OK"
          : "ITEM_BULK_RESTORE_OK",
      message: `${result.count}件の商品を${actionLabel}しました。`,
      summary: {
        requestedCount: itemIds.length,
        foundCount: targetItems.length,
        affectedCount: result.count,
      },
    });
  } catch (error) {
    console.error("POST /api/items/bulk", error);

    return toJsonError(
      "ITEM_BULK_FAILED",
      "一括操作に失敗しました。画面を再読み込みしてから、もう一度お試しください。",
      500
    );
  }
}