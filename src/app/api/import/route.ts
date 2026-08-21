import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type ImportRow = {
  storageLocation: string;
  managementCode?: string;
  managementGroupCode?: string;
  janCode?: string;
  name: string;
  manufacturer?: string;
  majorCategory?: string;
  minorCategory?: string;
  quantity: number;
  unit?: string;
  lotNo?: string;
  expirationDate?: string;
};

export async function POST(req: Request) {
  try {
    const { inventories } = (await req.json()) as {
      inventories: ImportRow[];
    };

    if (!inventories?.length) {
      return NextResponse.json({
        success: true,
        created: 0,
      });
    }

      let created = 0;

      // ------------------------
      // キャッシュ
      // ------------------------

      const itemCache = new Map<string, string>();

      const locationCache = new Map<string, string>();

      // ------------------------
      // 商品取得
      // ------------------------

      const allItems = await prisma.item.findMany();

      for (const item of allItems) {

        if (item.janCode) {
          itemCache.set(
            "JAN:" + item.janCode,
            item.id
          );
        }

        itemCache.set(
          "NAME:" + item.name,
          item.id
        );

      }

      // ------------------------
      // 保管場所取得
      // ------------------------

      const allLocations =
        await prisma.storageLocation.findMany();

      for (const location of allLocations) {

        locationCache.set(
          location.name,
          location.id
        );

      }

      // ------------------------
      // 既存在庫取得
      // ------------------------

      const inventoryCache = new Set<string>();

      const allInventory =
        await prisma.inventoryInstance.findMany();

      for (const inventory of allInventory) {

        inventoryCache.add(
          [
            inventory.itemId,
            inventory.storageLocationId ?? "",
            inventory.lotNo ?? "",
            inventory.expirationDate ?? "",
          ].join("|")
        );

      }

      // ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
      // Part2でこの続き
            // ------------------------
      // インポート開始
      // ------------------------

      for (const row of inventories) {

        // ===== 商品 =====

        const itemKey =
          row.janCode
            ? "JAN:" + row.janCode
            : "NAME:" + row.name;

        let itemId = itemCache.get(itemKey);

        if (!itemId) {

          const item = await prisma.item.create({

            data: {

              managementCode:
                row.managementCode || null,

              managementGroupCode:
                row.managementGroupCode || null,

              janCode:
                row.janCode || null,

              name:
                row.name,

              manufacturer:
                row.manufacturer || null,

              majorCategory:
                row.majorCategory || null,

              minorCategory:
                row.minorCategory || null,

              defaultUnit:
                row.unit || "個",

            },

          });

          itemId = item.id;

          if (row.janCode) {

            itemCache.set(
              "JAN:" + row.janCode,
              item.id
            );

          }

          itemCache.set(
            "NAME:" + row.name,
            item.id
          );

        }

        // ===== 保管場所 =====

        let locationId: string | null = null;

        if (row.storageLocation) {

          locationId =
            locationCache.get(
              row.storageLocation
            ) ?? null;

          if (!locationId) {

            const location =
              await prisma.storageLocation.create({

                data: {

                  name:
                    row.storageLocation,

                },

              });

            locationId = location.id;

            locationCache.set(
              row.storageLocation,
              location.id
            );

          }

        }

        // ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
        // Part3へ続く
                // ===== 重複チェック =====

        const inventoryKey = [
          itemId,
          locationId ?? "",
          row.lotNo ?? "",
          row.expirationDate ?? "",
        ].join("|");

        if (inventoryCache.has(inventoryKey)) {
          continue;
        }

        inventoryCache.add(inventoryKey);

        await prisma.inventoryInstance.create({

          data: {

            itemId,

            storageLocationId:
              locationId,

            managementCode:
              row.managementCode || null,

            managementGroupCode:
              row.managementGroupCode || null,

            quantity:
              Number(row.quantity),

            actualQuantity:
              Number(row.quantity),

            manufacturer:
              row.manufacturer || null,

            majorCategory:
              row.majorCategory || null,

            minorCategory:
              row.minorCategory || null,

            lotNo:
              row.lotNo || null,

            expirationDate:
              row.expirationDate || null,

            unit:
              row.unit || "個",

            allocationType:
              "home",

            status:
              "保管中",

            stocktakeStatus:
              "未棚卸",

          },

        });

        created++;

      }

      return NextResponse.json({

        success: true,

        created,

      });

  } catch (error) {
  console.error("IMPORT ERROR:", error);

  return NextResponse.json(
    {
      message:
        error instanceof Error
          ? error.message
          : String(error),
    },
    {
      status: 500,
    }
  );
}};