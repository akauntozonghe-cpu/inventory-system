import { NextRequest, NextResponse } from "next/server";
import { ItemService } from "@/services/ItemService";
import { createAdminActionLog } from "@/lib/error-report";
import { requireAdmin } from "@/lib/auth";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  try {
    const items = await ItemService.getAll();

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/items", error);

    return NextResponse.json(
      {
        code: "ITEM_LIST_500",
        message: "商品一覧を取得できませんでした。",
      },
      { status: 500 }
    );
  }
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
        code: "ADMIN_REQUIRED",
        message: "この操作には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const item = await ItemService.create(body);

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "ITEM_CREATE",
      route: "/api/items",
      detail: {
        itemId: item.id,
        name: item.name,
        janCode: item.janCode,
        systemBarcode: item.systemBarcode,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST /api/items", error);

    return NextResponse.json(
      {
        code: "ITEM_CREATE_400",
        message: errorMessage(error, "商品の登録に失敗しました。"),
      },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const adminUser = auth.user;

  if (!adminUser) {
    return NextResponse.json(
      {
        code: "ADMIN_REQUIRED",
        message: "この操作には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const item = await ItemService.update(body);

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "ITEM_UPDATE",
      route: "/api/items",
      detail: {
        itemId: item.id,
        name: item.name,
        janCode: item.janCode,
        systemBarcode: item.systemBarcode,
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("PUT /api/items", error);

    return NextResponse.json(
      {
        code: "ITEM_UPDATE_400",
        message: errorMessage(error, "商品の更新に失敗しました。"),
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const adminUser = auth.user;

  if (!adminUser) {
    return NextResponse.json(
      {
        code: "ADMIN_REQUIRED",
        message: "この操作には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const id = new URL(request.url).searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          code: "ITEM_DELETE_ID_400",
          message: "削除する商品IDが指定されていません。",
        },
        { status: 400 }
      );
    }

    const deleted = await ItemService.delete(id);

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "ITEM_DELETE",
      route: "/api/items",
      detail: {
        itemId: deleted.id,
        name: deleted.name,
        janCode: deleted.janCode,
        systemBarcode: deleted.systemBarcode,
      },
    });

    return NextResponse.json({
      success: true,
      deletedItemId: deleted.id,
    });
  } catch (error) {
    console.error("DELETE /api/items", error);

    return NextResponse.json(
      {
        code: "ITEM_DELETE_500",
        message: errorMessage(error, "商品の削除に失敗しました。"),
      },
      { status: 500 }
    );
  }
}