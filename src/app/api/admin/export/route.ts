import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";

export const runtime = "nodejs";

type ExportType = "inventory" | "items" | "stocktake" | "audit";

type CsvCell = {
  value: unknown;
  text?: boolean;
};

function cell(value: unknown, text = false): CsvCell {
  return { value, text };
}

function escapeCsv(value: unknown, forceText = false) {
  if (value === null || value === undefined) {
    return "";
  }

  const rawText =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  // ExcelでJANなどが 4.59E+12 にならないよう、文字列として出力する
  const text = forceText ? `\t${rawText}` : rawText;

  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(headers: string[], rows: CsvCell[][]) {
  const body = [
    headers.map((header) => escapeCsv(header)).join(","),
    ...rows.map((row) =>
      row
        .map((item) => escapeCsv(item.value, item.text ?? false))
        .join(",")
    ),
  ].join("\r\n");

  // Excelで日本語が文字化けしないUTF-8 BOM
  return `\uFEFF${body}`;
}

function createDownloadResponse(filename: string, csv: string) {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function isExportType(value: string | null): value is ExportType {
  return (
    value === "inventory" ||
    value === "items" ||
    value === "stocktake" ||
    value === "audit"
  );
}

export async function GET(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "ADMIN_EXPORT_AUTH_401",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json(
      {
        code: "ADMIN_EXPORT_FORBIDDEN",
        message: "バックアップを出力する権限がありません。",
      },
      { status: 403 }
    );
  }

  try {
    const requestedType = request.nextUrl.searchParams.get("type");

    if (!isExportType(requestedType)) {
      return NextResponse.json(
        {
          code: "ADMIN_EXPORT_TYPE_INVALID",
          message: "出力種別が正しくありません。",
        },
        { status: 400 }
      );
    }

    const dateLabel = new Date()
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");

    if (requestedType === "inventory") {
      const inventories = await prisma.inventoryInstance.findMany({
        include: {
          item: true,
          storageLocation: true,
        },
        orderBy: [
          {
            item: {
              name: "asc",
            },
          },
          {
            createdAt: "asc",
          },
        ],
      });

      const csv = toCsv(
        [
          "在庫ID",
          "商品名",
          "JAN",
          "システムバーコード",
          "管理番号",
          "メーカー",
          "大分類",
          "小分類",
          "保管場所",
          "ロット番号",
          "使用期限",
          "単位",
          "理論在庫",
          "実在庫",
          "棚卸状態",
          "棚卸日時",
          "在庫状態",
          "作成日時",
          "更新日時",
        ],
        inventories.map((inventory) => [
          cell(inventory.id, true),
          cell(inventory.item.name),
          cell(inventory.item.janCode, true),
          cell(inventory.item.systemBarcode, true),
          cell(
            inventory.managementCode ?? inventory.item.managementCode,
            true
          ),
          cell(inventory.manufacturer ?? inventory.item.manufacturer),
          cell(inventory.majorCategory ?? inventory.item.majorCategory),
          cell(inventory.minorCategory ?? inventory.item.minorCategory),
          cell(inventory.storageLocation?.name),
          cell(inventory.lotNo, true),
          cell(inventory.expirationDate, true),
          cell(inventory.unit ?? inventory.item.defaultUnit),
          cell(inventory.quantity),
          cell(inventory.actualQuantity),
          cell(inventory.stocktakeStatus),
          cell(inventory.stocktakeAt),
          cell(inventory.status),
          cell(inventory.createdAt),
          cell(inventory.updatedAt),
        ])
      );

      await prisma.adminActionLog.create({
        data: {
          adminUserId: user.id,
          action: "EXPORT_CSV_BACKUP",
          route: "/api/admin/export?type=inventory",
          detail: {
            exportType: "inventory",
            rowCount: inventories.length,
          },
        },
      });

      return createDownloadResponse(
        `inventory-backup-${dateLabel}.csv`,
        csv
      );
    }

    if (requestedType === "items") {
      const items = await prisma.item.findMany({
        include: {
          _count: {
            select: {
              inventoryInstances: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      const csv = toCsv(
        [
          "商品ID",
          "商品名",
          "JAN",
          "システムバーコード",
          "管理番号",
          "管理グループ番号",
          "メーカー",
          "大分類",
          "小分類",
          "標準単位",
          "在庫件数",
          "作成日時",
          "更新日時",
        ],
        items.map((item) => [
          cell(item.id, true),
          cell(item.name),
          cell(item.janCode, true),
          cell(item.systemBarcode, true),
          cell(item.managementCode, true),
          cell(item.managementGroupCode, true),
          cell(item.manufacturer),
          cell(item.majorCategory),
          cell(item.minorCategory),
          cell(item.defaultUnit),
          cell(item._count.inventoryInstances),
          cell(item.createdAt),
          cell(item.updatedAt),
        ])
      );

      await prisma.adminActionLog.create({
        data: {
          adminUserId: user.id,
          action: "EXPORT_CSV_BACKUP",
          route: "/api/admin/export?type=items",
          detail: {
            exportType: "items",
            rowCount: items.length,
          },
        },
      });

      return createDownloadResponse(`item-master-${dateLabel}.csv`, csv);
    }

    if (requestedType === "stocktake") {
      const sessions = await prisma.stocktakeSession.findMany({
        include: {
          operatorUser: {
            select: {
              username: true,
              displayName: true,
            },
          },
          _count: {
            select: {
              targets: true,
              records: true,
            },
          },
        },
        orderBy: {
          startedAt: "desc",
        },
      });

      const csv = toCsv(
        [
          "棚卸ID",
          "棚卸名",
          "状態",
          "入力担当者名",
          "ログイン実施者",
          "対象範囲",
          "対象値",
          "対象ラベル",
          "棚・エリア",
          "メモ",
          "対象件数",
          "入力件数",
          "開始日時",
          "中断日時",
          "終了日時",
          "取消日時",
          "取消理由",
          "作成日時",
          "更新日時",
        ],
        sessions.map((session) => [
          cell(session.id, true),
          cell(session.title),
          cell(session.status),
          cell(session.operator),
          cell(session.operatorUser?.displayName ?? session.operatorUser?.username),
          cell(session.scopeType),
          cell(session.scopeValue, true),
          cell(session.scopeLabel),
          cell(session.location),
          cell(session.memo),
          cell(session._count.targets),
          cell(session._count.records),
          cell(session.startedAt),
          cell(session.pausedAt),
          cell(session.completedAt),
          cell(session.cancelledAt),
          cell(session.cancellationNote),
          cell(session.createdAt),
          cell(session.updatedAt),
        ])
      );

      await prisma.adminActionLog.create({
        data: {
          adminUserId: user.id,
          action: "EXPORT_CSV_BACKUP",
          route: "/api/admin/export?type=stocktake",
          detail: {
            exportType: "stocktake",
            rowCount: sessions.length,
          },
        },
      });

      return createDownloadResponse(
        `stocktake-history-${dateLabel}.csv`,
        csv
      );
    }

    const logs = await prisma.adminActionLog.findMany({
      include: {
        adminUser: {
          select: {
            username: true,
            displayName: true,
          },
        },
        errorReport: {
          select: {
            code: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const csv = toCsv(
      [
        "ログID",
        "操作日時",
        "実行者",
        "ユーザー名",
        "操作種別",
        "対象ユーザーID",
        "対象棚卸ID",
        "関連エラーコード",
        "画面・API",
        "詳細",
      ],
      logs.map((log) => [
        cell(log.id, true),
        cell(log.createdAt),
        cell(log.adminUser.displayName),
        cell(log.adminUser.username, true),
        cell(log.action),
        cell(log.targetUserId, true),
        cell(log.targetSessionId, true),
        cell(log.errorReport?.code, true),
        cell(log.route),
        cell(log.detail),
      ])
    );

    await prisma.adminActionLog.create({
      data: {
        adminUserId: user.id,
        action: "EXPORT_CSV_BACKUP",
        route: "/api/admin/export?type=audit",
        detail: {
          exportType: "audit",
          rowCount: logs.length,
        },
      },
    });

    return createDownloadResponse(`admin-audit-${dateLabel}.csv`, csv);
  } catch (error) {
    console.error("GET /api/admin/export", error);

    return NextResponse.json(
      {
        code: "ADMIN_EXPORT_FAILED",
        message: "バックアップCSVを作成できませんでした。",
      },
      { status: 500 }
    );
  }
}