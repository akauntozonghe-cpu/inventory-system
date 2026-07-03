import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(
  req: Request
) {
  const body =
    await req.json();

  const inventory =
    await prisma.inventoryInstance.update(
      {
        where: {
          id:
            body.inventoryId,
        },

        data: {
          actualQuantity:
            Number(
              body.actualQuantity
            ),
        },
      }
    );

  return NextResponse.json(
    inventory
  );
}