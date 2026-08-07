import { NextResponse } from "next/server";
import { ItemService } from "@/services/ItemService";
export async function GET() {
  try {
    const items = await ItemService.getAll();

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/items", error);

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

    const item = await ItemService.create(body);

    return NextResponse.json(item);
  } catch (error) {
    console.error("POST /api/items", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "商品の登録に失敗しました。",
      },
      {
        status: 400,
      }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();

    const item = await ItemService.update(body);

    return NextResponse.json(item);
  } catch (error) {
    console.error("PUT /api/items", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "商品の更新に失敗しました。",
      },
      {
        status: 400,
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

    await ItemService.delete(id);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("DELETE /api/items", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "商品の削除に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}