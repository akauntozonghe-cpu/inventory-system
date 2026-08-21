import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createAdminActionLog } from "@/lib/error-report";

function getText(value: unknown, maxLength = 200) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

export async function GET() {
  try {
    const locations = await prisma.storageLocation.findMany({
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(locations);
  } catch (error) {
    console.error("GET /api/storage-locations", error);

    return NextResponse.json(
      {
        code: "LOCATION_LIST_FAILED",
        message: "保管場所を取得できませんでした。",
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
        message: "保管場所の登録には管理者権限が必要です。",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    const name = getText(body.name, 100);
    const description = getText(body.description, 500) || null;

    if (!name) {
      return NextResponse.json(
        {
          code: "LOCATION_NAME_REQUIRED",
          message: "保管場所名を入力してください。",
        },
        { status: 400 }
      );
    }

    const exists = await prisma.storageLocation.findUnique({
      where: {
        name,
      },
    });

    if (exists) {
      return NextResponse.json(exists);
    }

    const location = await prisma.storageLocation.create({
      data: {
        name,
        description,
      },
    });

    await createAdminActionLog({
      adminUserId: adminUser.id,
      action: "STORAGE_LOCATION_CREATE",
      route: "/api/storage-locations",
      detail: {
        storageLocationId: location.id,
        name: location.name,
        description: location.description ?? "",
      },
    });

    return NextResponse.json(location, {
      status: 201,
    });
  } catch (error) {
    console.error("POST /api/storage-locations", error);

    return NextResponse.json(
      {
        code: "LOCATION_CREATE_FAILED",
        message: "保管場所の登録に失敗しました。",
      },
      { status: 500 }
    );
  }
}