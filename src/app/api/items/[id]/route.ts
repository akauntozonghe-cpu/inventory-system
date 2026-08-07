import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params;

    const item = await prisma.item.findUnique({
      where: {
        id,
      },
      include: {
  inventoryInstances: {
    include: {
      storageLocation: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  },
},
    });

    if (!item) {
      return NextResponse.json(
        {
          message: "商品が見つかりません",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "取得に失敗しました",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params;

    const body = await req.json();

    const item = await prisma.item.update({
      where: {
        id,
      },
      data: {
        managementCode: body.managementCode,
        managementGroupCode:
          body.managementGroupCode,
        janCode: body.janCode,
        name: body.name,
        majorCategory: body.majorCategory,
        minorCategory: body.minorCategory,
        defaultUnit: body.defaultUnit,
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "更新失敗",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params;

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
        message: "削除失敗",
      },
      {
        status: 500,
      }
    );
  }
}