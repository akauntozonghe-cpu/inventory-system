import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";
import { normalizeExpirationDate } from "@/lib/expiry-management";

const MAX_IMPORT_ROWS = 1000;

type ImportRow = {
  storageLocation?: unknown;
  managementCode?: unknown;
  managementGroupCode?: unknown;
  janCode?: unknown;
  name?: unknown;
  manufacturer?: unknown;
  majorCategory?: unknown;
  minorCategory?: unknown;
  quantity?: unknown;
  unit?: unknown;
  lotNo?: unknown;
  expirationDate?: unknown;
};

type ValidatedRow = {
  rowNumber: number;
  storageLocation: string;
  managementCode: string | null;
  managementGroupCode: string | null;
  janCode: string | null;
  name: string;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  quantity: number;
  unit: string | null;
  lotNo: string | null;
  expirationDate: string | null;
};

function getText(value: unknown, maxLength = 300) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function getOptionalText(value: unknown, maxLength = 300) {
  return getText(value, maxLength) || null;
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function createSystemBarcode() {
  return `SYS-${randomUUID()
    .replace(/-/g, "")
    .slice(0, 18)
    .toUpperCase()}`;
}

function validateRow(
  row: ImportRow,
  rowNumber: number
):
  | { success: true; data: ValidatedRow }
  | { success: false; message: string } {
  const storageLocation = getText(row.storageLocation, 100);
  const name = getText(row.name, 200);
  const quantity = Number(row.quantity);
  const expirationDate = normalizeExpirationDate(row.expirationDate);

  if (!storageLocation) {
    return {
      success: false,
      message: `${rowNumber}行目：保管場所を入力してください。`,
    };
  }

  if (!name) {
    return {
      success: false,
      message: `${rowNumber}行目：商品名を入力してください。`,
    };
  }

  if (!Number.isInteger(quantity) || quantity < 0) {
    return {
      success: false,
      message:
        `${rowNumber}行目：数量は0以上の整数で入力してください。`,
    };
  }

  if (expirationDate === undefined) {
    return { success: false, message: `${rowNumber}行目：使用期限は未入力、YYYY-MM、YYYY-MM-DDのいずれかで入力してください。` };
  }

  return {
    success: true,
    data: {
      rowNumber,
      storageLocation,
      managementCode: getOptionalText(
        row.managementCode,
        100
      ),
      managementGroupCode: getOptionalText(
        row.managementGroupCode,
        100
      ),
      janCode: getOptionalText(row.janCode, 30),
      name,
      manufacturer: getOptionalText(row.manufacturer, 200),
      majorCategory: getOptionalText(row.majorCategory, 100),
      minorCategory: getOptionalText(row.minorCategory, 100),
      quantity,
      unit: getOptionalText(row.unit, 30),
      lotNo: getOptionalText(row.lotNo, 100),
      expirationDate,
    },
  };
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
        message: "一括取込には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const rawRows = body?.inventories;

    if (!Array.isArray(rawRows)) {
      return NextResponse.json(
        {
          success: false,
          code: "IMPORT_DATA_REQUIRED",
          message: "取込データが見つかりません。",
        },
        { status: 400 }
      );
    }

    if (rawRows.length === 0) {
      return NextResponse.json({
        success: true,
        createdItems: 0,
        createdLocations: 0,
        createdInventories: 0,
        skippedInventories: 0,
        message: "取込対象はありません。",
      });
    }

    if (rawRows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        {
          success: false,
          code: "IMPORT_ROW_LIMIT_EXCEEDED",
          message:
            `一度に取込できるのは${MAX_IMPORT_ROWS}件までです。`,
        },
        { status: 400 }
      );
    }

    const rows: ValidatedRow[] = [];

    for (let index = 0; index < rawRows.length; index += 1) {
      const result = validateRow(
        rawRows[index] as ImportRow,
        index + 1
      );

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            code: "IMPORT_ROW_INVALID",
            message: result.message,
          },
          { status: 400 }
        );
      }

      rows.push(result.data);
    }

    const result = await prisma.$transaction(
      async (transaction) => {
        const itemCache = new Map<string, string>();
        const locationCache = new Map<string, string>();
        const inventoryKeys = new Set<string>();

        const [
          existingItems,
          existingLocations,
          existingInventories,
        ] = await Promise.all([
          transaction.item.findMany(),
          transaction.storageLocation.findMany(),
          transaction.inventoryInstance.findMany({
            select: {
              itemId: true,
              storageLocationId: true,
              lotNo: true,
              expirationDate: true,
            },
          }),
        ]);

        for (const item of existingItems) {
          if (item.managementCode) {
            itemCache.set(
              `MANAGEMENT:${item.managementCode}`,
              item.id
            );
          }

          if (item.janCode) {
            itemCache.set(`JAN:${item.janCode}`, item.id);
          }

          const nameKey = [
            normalize(item.name),
            normalize(item.manufacturer ?? ""),
            normalize(item.majorCategory ?? ""),
            normalize(item.minorCategory ?? ""),
            normalize(item.defaultUnit ?? ""),
          ].join("|");

          itemCache.set(`NAME:${nameKey}`, item.id);
        }

        for (const location of existingLocations) {
          locationCache.set(normalize(location.name), location.id);
        }

        for (const inventory of existingInventories) {
          inventoryKeys.add(
            [
              inventory.itemId,
              inventory.storageLocationId ?? "",
              inventory.lotNo ?? "",
              inventory.expirationDate ?? "",
            ].join("|")
          );
        }

        let createdItems = 0;
        let createdLocations = 0;
        let createdInventories = 0;
        let skippedInventories = 0;

        for (const row of rows) {
          const nameKey = [
            normalize(row.name),
            normalize(row.manufacturer ?? ""),
            normalize(row.majorCategory ?? ""),
            normalize(row.minorCategory ?? ""),
            normalize(row.unit ?? ""),
          ].join("|");

          const lookupKeys = [
            row.managementCode
              ? `MANAGEMENT:${row.managementCode}`
              : "",
            row.janCode ? `JAN:${row.janCode}` : "",
            `NAME:${nameKey}`,
          ].filter(Boolean);

          let itemId: string | undefined;

          for (const key of lookupKeys) {
            const found = itemCache.get(key);

            if (found) {
              itemId = found;
              break;
            }
          }

          if (!itemId) {
            const item = await transaction.item.create({
              data: {
                managementCode: row.managementCode,
                managementGroupCode:
                  row.managementGroupCode,
                janCode: row.janCode,
                systemBarcode: row.janCode
                  ? null
                  : createSystemBarcode(),
                name: row.name,
                manufacturer: row.manufacturer,
                majorCategory: row.majorCategory,
                minorCategory: row.minorCategory,
                defaultUnit: row.unit ?? "個",
              },
            });

            itemId = item.id;
            createdItems += 1;

            if (item.managementCode) {
              itemCache.set(
                `MANAGEMENT:${item.managementCode}`,
                item.id
              );
            }

            if (item.janCode) {
              itemCache.set(`JAN:${item.janCode}`, item.id);
            }

            itemCache.set(`NAME:${nameKey}`, item.id);
          }

          const locationKey = normalize(row.storageLocation);
          let storageLocationId = locationCache.get(locationKey);

          if (!storageLocationId) {
            const location =
              await transaction.storageLocation.create({
                data: {
                  name: row.storageLocation,
                },
              });

            storageLocationId = location.id;
            locationCache.set(locationKey, location.id);
            createdLocations += 1;
          }

          const inventoryKey = [
            itemId,
            storageLocationId,
            row.lotNo ?? "",
            row.expirationDate ?? "",
          ].join("|");

          if (inventoryKeys.has(inventoryKey)) {
            skippedInventories += 1;
            continue;
          }

          inventoryKeys.add(inventoryKey);

          const item = await transaction.item.findUniqueOrThrow({
            where: {
              id: itemId,
            },
          });

          const inventory =
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
                quantity: row.quantity,
                actualQuantity: row.quantity,
                lotNo: row.lotNo,
                expirationDate: row.expirationDate,
                unit: row.unit ?? item.defaultUnit ?? "個",
                allocationType: "home",
                status: "保管中",
                stocktakeStatus: "未棚卸",
              },
            });

          await transaction.inventoryHistory.create({
            data: {
              inventoryInstanceId: inventory.id,
              changeQuantity: row.quantity,
              action: "CSV一括取込",
            },
          });

          createdInventories += 1;
        }

        return {
          importedRows: rows.length,
          createdItems,
          createdLocations,
          createdInventories,
          skippedInventories,
        };
      },
      {
        maxWait: 15_000,
        timeout: 60_000,
      }
    );

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "INVENTORY_BULK_IMPORT",
      route: "/api/import",
      detail: result,
    });

    return NextResponse.json({
      success: true,
      ...result,
      message: "在庫データを取り込みました。",
    });
  } catch (error) {
    console.error("POST /api/import", error);

    const message =
      error instanceof Error
        ? error.message
        : "一括取込に失敗しました。";

    const isUniqueError =
      "code" in (error as object) &&
      (error as { code?: string }).code === "P2002";

    return NextResponse.json(
      {
        success: false,
        code: isUniqueError
          ? "IMPORT_DUPLICATE_DATA"
          : "IMPORT_FAILED",
        message: isUniqueError
          ? "管理番号またはJANコードが重複しています。"
          : message,
      },
      { status: 400 }
    );
  }
}
