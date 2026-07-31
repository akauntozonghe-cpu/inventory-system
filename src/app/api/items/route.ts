import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const items = await prisma.item.findMany({
      include: {
        inventoryInstances: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    // デバッグ用
    console.log("====================================");
    console.log("Item件数:", items.length);

    const inventoryCount = items.reduce(
      (sum, item) => sum + item.inventoryInstances.length,
      0
    );

    console.log("Inventory件数:", inventoryCount);
    console.log("====================================");

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/items ERROR:", error);

    return NextResponse.json(
      {
        message: "商品の取得に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("POST /api/items", body);

    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        {
          message: "商品名がありません。",
        },
        {
          status: 400,
        }
      );
    }

    const where: any[] = [];

    if (body.managementCode?.trim()) {
      where.push({
        managementCode: body.managementCode.trim(),
      });
    }

    if (body.janCode?.trim()) {
      where.push({
        janCode: body.janCode.trim(),
      });
    }

    let existingItem = null;

    if (where.length > 0) {
      existingItem = await prisma.item.findFirst({
        where: {
          OR: where,
        },
      });
    }

    if (existingItem) {
      return NextResponse.json(existingItem);
    }

    const item = await prisma.item.create({
      data: {
        managementCode:
          body.managementCode?.trim() || null,

        managementGroupCode:
          body.managementGroupCode?.trim() || null,

        janCode:
          body.janCode?.trim() || null,

        name:
          body.name.trim(),

        manufacturer:
          body.manufacturer?.trim() || null,

        majorCategory:
          body.majorCategory?.trim() || null,

        minorCategory:
          body.minorCategory?.trim() || null,

        defaultUnit:
          body.defaultUnit?.trim() || "個",
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "商品の登録に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();

    const item = await prisma.item.update({
      where: {
        id: body.id,
      },
      data: {
        managementCode:
          body.managementCode?.trim() || null,

        managementGroupCode:
          body.managementGroupCode?.trim() || null,

        janCode:
          body.janCode?.trim() || null,

        name:
          body.name.trim(),

        manufacturer:
          body.manufacturer?.trim() || null,

        majorCategory:
          body.majorCategory?.trim() || null,

        minorCategory:
          body.minorCategory?.trim() || null,

        defaultUnit:
          body.defaultUnit?.trim() || "個",
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "商品の更新に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          message: "IDが指定されていません。",
        },
        {
          status: 400,
        }
      );
    }

    await prisma.item.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "商品の削除に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}