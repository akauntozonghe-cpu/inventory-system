import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getLoggedInUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function getText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalText(value: unknown) {
  const text = getText(value);
  return text === "" ? null : text;
}

function makeSystemBarcode() {
  return `SYS-${randomUUID()
    .replace(/-/g, "")
    .slice(0, 16)
    .toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const user = getLoggedInUser(request);

    if (!user) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_AUTH_401",
          message: "Login is required.",
        },
        { status: 401 }
      );
    }

    const rawBody: unknown = await request.json();

    if (typeof rawBody !== "object" || rawBody === null) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_BODY_400",
          message: "Invalid request body.",
        },
        { status: 400 }
      );
    }

    const body = rawBody as Record<string, unknown>;

    const name = getText(body.name);
    const janCode = getOptionalText(body.janCode);
    const systemBarcode =
      getOptionalText(body.systemBarcode) ?? makeSystemBarcode();

    const quantity = Number(body.quantity ?? 0);
    const storageLocationId = getOptionalText(
      body.storageLocationId
    );

    if (!name) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_NAME_400",
          message: "Item name is required.",
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      return NextResponse.json(
        {
          code: "ITEM_REGISTER_QUANTITY_400",
          message: "Quantity must be a non-negative integer.",
        },
        { status: 400 }
      );
    }

    if (storageLocationId) {
      const location = await prisma.storageLocation.findUnique({
        where: {
          id: storageLocationId,
        },
        select: {
          id: true,
        },
      });

      if (!location) {
        return NextResponse.json(
          {
            code: "ITEM_REGISTER_LOCATION_404",
            message: "Storage location was not found.",
          },
          { status: 404 }
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      if (janCode) {
        const duplicateJan = await tx.item.findFirst({
          where: {
            janCode,
          },
          select: {
            id: true,
          },
        });

        if (duplicateJan) {
          throw new Error("ITEM_REGISTER_JAN_DUPLICATE");
        }
      }

      const duplicateBarcode = await tx.item.findUnique({
        where: {
          systemBarcode,
        },
        select: {
          id: true,
        },
      });

      if (duplicateBarcode) {
        throw new Error("ITEM_REGISTER_BARCODE_DUPLICATE");
      }

      const managementCode = getOptionalText(
        body.managementCode
      );

      if (managementCode) {
        const duplicateManagementCode = await tx.item.findUnique({
          where: {
            managementCode,
          },
          select: {
            id: true,
          },
        });

        if (duplicateManagementCode) {
          throw new Error("ITEM_REGISTER_MANAGEMENT_CODE_DUPLICATE");
        }
      }

      const item = await tx.item.create({
        data: {
          name,
          janCode,
          systemBarcode,
          managementCode,
          managementGroupCode: getOptionalText(
            body.managementGroupCode
          ),
          manufacturer: getOptionalText(body.manufacturer),
          majorCategory: getOptionalText(body.majorCategory),
          minorCategory: getOptionalText(body.minorCategory),
          defaultUnit: getOptionalText(body.unit),
        },
      });

      const inventory = await tx.inventoryInstance.create({
        data: {
          itemId: item.id,
          storageLocationId,
          managementCode,
          managementGroupCode: getOptionalText(
            body.managementGroupCode
          ),
          manufacturer: getOptionalText(body.manufacturer),
          majorCategory: getOptionalText(body.majorCategory),
          minorCategory: getOptionalText(body.minorCategory),
          lotNo: getOptionalText(body.lotNo),
          expirationDate: getOptionalText(body.expirationDate),
          unit: getOptionalText(body.unit),
          quantity,
          actualQuantity: quantity,
          allocationType: "home",
          status: "IN_STOCK",
        },
        include: {
          item: true,
          storageLocation: true,
        },
      });

      await tx.inventoryHistory.create({
        data: {
          inventoryInstanceId: inventory.id,
          changeQuantity: quantity,
          action: "ITEM_REGISTER",
        },
      });

      return {
        item,
        inventory,
      };
    });

    return NextResponse.json(
      {
        success: true,
        message: "Item registered.",
        ...result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("ITEM_REGISTER_ERROR", error);

    const message =
      error instanceof Error
        ? error.message
        : "ITEM_REGISTER_FAILED";

    return NextResponse.json(
      {
        code: message.startsWith("ITEM_REGISTER_")
          ? message
          : "ITEM_REGISTER_500",
        message,
      },
      { status: 400 }
    );
  }
}