import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const items =
    await prisma.item.findMany();

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await req.json();

  const existingItem =
    await prisma.item.findFirst({
      where: {
        OR: [
          {
            managementCode:
              body.managementCode,
          },

          {
            janCode:
              body.janCode,
          },
        ],
      },
    });

  if (existingItem) {
    return NextResponse.json(
      existingItem
    );
  }

  const item =
    await prisma.item.create({
      data: {
        managementCode:
          body.managementCode,

        managementGroupCode:
          body.managementGroupCode,

        janCode:
          body.janCode,

        name:
          body.name,

        majorCategory:
          body.majorCategory,

        minorCategory:
          body.minorCategory,

        defaultUnit:
          body.defaultUnit,
      },
    });

  return NextResponse.json(item);
}