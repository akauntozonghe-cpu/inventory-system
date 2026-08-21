import { NextRequest, NextResponse } from "next/server";
import { ItemService } from "@/services/ItemService";
import { createAdminActionLog } from "@/lib/error-report";
import {
  getLoggedInUser,
  hasAdminAccess,
  requireAdmin,
} from "@/lib/auth";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  const user = getLoggedInUser(request);

  if (!user) {
    return NextResponse.json(
      {
        code: "ITEM_LIST_AUTH_REQUIRED",
        message: "ログイン情報を確認できませんでした。",
      },
      { status: 401 }
    );
  }

  try {
    const includeArchived =
      request.nextUrl.searchParams.get("includeArchived") === "true";

    if (includeArchived && !hasAdminAccess(request)) {
      return NextResponse.json(
        {
          code: "ITEM_LIST_ARCHIVED_ADMIN_REQUIRED",
          message: "廃止商品を表示するには管理者権限が必要です。",
        },
        { status: 403 }
      );
    }

    const items = await ItemService.getAll({
      includeArchived,
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/items", error);

    return NextResponse.json(
      {
        code: "ITEM_LIST_500",
        message: errorMessage(error, "商品一覧を取得できませんでした。"),
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
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          code: "ITEM_DELETE_ID_400",
          message: "削除する商品IDが指定されていません。",
        },
        { status: 400 }
      );
    }

    const result = await ItemService.delete(id);

    if (!result.deleted) {
      return NextResponse.json(
        {
          code: "ITEM_DELETE_HAS_INVENTORY",
          message: `この商品には在庫が${result.inventoryCount}件紐づいているため削除できません。商品情報を更新するか、廃止して運用してください。`,
          itemId: result.item.id,
          inventoryCount: result.inventoryCount,
        },
        { status: 409 }
      );
    }

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "ITEM_DELETE",
      route: "/api/items",
      detail: {
        itemId: result.item.id,
        name: result.item.name,
        janCode: result.item.janCode,
        systemBarcode: result.item.systemBarcode,
      },
    });

    return NextResponse.json({
      success: true,
      code: "ITEM_DELETE_OK",
      message: "未使用の商品を削除しました。",
      deletedItemId: result.item.id,
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