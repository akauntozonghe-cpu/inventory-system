import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const locations =
    await prisma.storageLocation.findMany({
      orderBy: {
        name: "asc",
      },
    });

  return NextResponse.json(locations);
}

export async function POST(req: Request) {
  const body = await req.json();

  const existingLocation =
    await prisma.storageLocation.findFirst({
      where: {
        name: body.name,
      },
    });

  if (existingLocation) {
    return NextResponse.json(
      existingLocation
    );
  }

  const location =
    await prisma.storageLocation.create({
      data: {
        name: body.name,

        description:
          body.description,
      },
    });

  return NextResponse.json(location);
}