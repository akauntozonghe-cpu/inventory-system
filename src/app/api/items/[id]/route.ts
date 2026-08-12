import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

type ItemInput = {
  name?: unknown;
  janCode?: unknown;
  systemBarcode?: unknown;
  managementCode?: unknown;
  managementGroupCode?: unknown;
  manufacturer?: unknown;
  majorCategory?: unknown;
  minorCategory?: unknown;
  defaultUnit?: unknown;
  reason?: unknown;
};

type NormalizedItemData = {
  name: string;
  janCode: string | null;
  systemBarcode: string | null;
  managementCode: string | null;
  managementGroupCode: string | null;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  defaultUnit: string | null;
};

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().slice(0, maxLength);

  return text || null;
}

function requiredText(value: unknown, maxLength: number) {
  return optionalText(value, maxLength) ?? "";
}

function toItemData(body: ItemInput): NormalizedItemData {
  return {
    name: requiredText(body.name, 200),
    janCode: optionalText(body.janCode, 30),
    systemBarcode: optionalText(body.systemBarcode, 30),
    managementCode: optionalText(body.managementCode, 100),
    managementGroupCode: optionalText(body.managementGroupCode, 100),
    manufacturer: optionalText(body.manufacturer, 200),
    majorCategory: optionalText(body.majorCategory, 100),
    minorCategory: optionalText(body.minorCategory, 100),
    defaultUnit: optionalText(body.defaultUnit, 30),
  };
}

function itemSnapshot(item: {
  id: string;
  name: string;
  janCode: string | null;
  systemBarcode: string | null;
  managementCode: string | null;
  managementGroupCode: string | null;
  manufacturer: string | null;
  majorCategory: string | null;
  minorCategory: string | null;
  defaultUnit: string | null;
}) {
  return {
    id: item.id,
    name: item.name,
    janCode: item.janCode,
    systemBarcode: item.systemBarcode,
    managementCode: item.managementCode,
    managementGroupCode: item.managementGroupCode,
    manufacturer: item.manufacturer,
    majorCategory: item.majorCategory,
    minorCategory: item.minorCategory,
    defaultUnit: item.defaultUnit,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params;

    const item = await prisma.item.findUnique({
      where: { id },
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
          code: "ITEM_NOT_FOUND",
          message: "商品が見つかりません。",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      code: "ITEM_GET_OK",
      item,
    });
  } catch (error) {
    console.error("GET /api/items/[id]", error);

    return NextResponse.json(
      {
        code: "ITEM_GET_FAILED",
        message: "商品情報の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: Params
) {
  const auth = requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const adminUser = auth.user;

  if (!adminUser) {
    return NextResponse.json(
      {
        code: "ITEM_UPDATE_ADMIN_REQUIRED",
        message: "商品情報の更新には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const rawBody: unknown = await request.json();

    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json(
        {
          code: "ITEM_UPDATE_BODY_INVALID",
          message: "更新内容が正しくありません。",
        },
        { status: 400 }
      );
    }

    const body = rawBody as ItemInput;
    const data = toItemData(body);
    const reason = requiredText(body.reason, 300);

    if (!data.name) {
      return NextResponse.json(
        {
          code: "ITEM_UPDATE_NAME_REQUIRED",
          message: "商品名を入力してください。",
        },
        { status: 400 }
      );
    }

    if (!reason) {
      return NextResponse.json(
        {
          code: "ITEM_UPDATE_REASON_REQUIRED",
          message: "変更理由を入力してください。",
        },
        { status: 400 }
      );
    }

    const before = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        janCode: true,
        systemBarcode: true,
        managementCode: true,
        managementGroupCode: true,
        manufacturer: true,
        majorCategory: true,
        minorCategory: true,
        defaultUnit: true,
      },
    });

    if (!before) {
      return NextResponse.json(
        {
          code: "ITEM_UPDATE_NOT_FOUND",
          message: "更新する商品が見つかりません。",
        },
        { status: 404 }
      );
    }

    if (data.janCode) {
      const duplicateJan = await prisma.item.findFirst({
        where: {
          janCode: data.janCode,
          NOT: { id },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (duplicateJan) {
        return NextResponse.json(
          {
            code: "ITEM_UPDATE_JAN_DUPLICATE",
            message: `JAN「${data.janCode}」は「${duplicateJan.name}」ですでに使用されています。`,
          },
          { status: 409 }
        );
      }
    }

    if (data.systemBarcode) {
      const duplicateSystemBarcode = await prisma.item.findFirst({
        where: {
          systemBarcode: data.systemBarcode,
          NOT: { id },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (duplicateSystemBarcode) {
        return NextResponse.json(
          {
            code: "ITEM_UPDATE_SYSTEM_BARCODE_DUPLICATE",
            message: `システムバーコード「${data.systemBarcode}」は「${duplicateSystemBarcode.name}」ですでに使用されています。`,
          },
          { status: 409 }
        );
      }
    }

    if (data.managementCode) {
      const duplicateManagementCode = await prisma.item.findFirst({
        where: {
          managementCode: data.managementCode,
          NOT: { id },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (duplicateManagementCode) {
        return NextResponse.json(
          {
            code: "ITEM_UPDATE_MANAGEMENT_CODE_DUPLICATE",
            message: `管理コード「${data.managementCode}」は「${duplicateManagementCode.name}」ですでに使用されています。`,
          },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.item.update({
      where: { id },
      data: {
        name: data.name,
        janCode: data.janCode,
        systemBarcode: data.systemBarcode,
        managementCode: data.managementCode,
        managementGroupCode: data.managementGroupCode,
        manufacturer: data.manufacturer,
        majorCategory: data.majorCategory,
        minorCategory: data.minorCategory,
        defaultUnit: data.defaultUnit,
      },
      select: {
        id: true,
        name: true,
        janCode: true,
        systemBarcode: true,
        managementCode: true,
        managementGroupCode: true,
        manufacturer: true,
        majorCategory: true,
        minorCategory: true,
        defaultUnit: true,
        updatedAt: true,
      },
    });

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "ITEM_UPDATE",
      route: `/api/items/${id}`,
      detail: {
        reason,
        before: itemSnapshot(before),
        after: itemSnapshot(updated),
      },
    });

    return NextResponse.json({
      success: true,
      code: "ITEM_UPDATE_OK",
      message: "商品情報を更新しました。",
      item: updated,
    });
  } catch (error) {
    console.error("PUT /api/items/[id]", error);

    return NextResponse.json(
      {
        code: "ITEM_UPDATE_FAILED",
        message: "商品情報の更新に失敗しました。",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: Params
) {
  const auth = requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;

  return NextResponse.json(
    {
      code: "ITEM_DELETE_DISABLED",
      message:
        "商品は削除できません。在庫・棚卸履歴・監査記録との整合性を守るため、商品情報を更新して運用してください。",
      itemId: id,
    },
    { status: 409 }
  );
}