import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {

    const locations =
      await prisma.storageLocation.findMany({

        orderBy: {
          name: "asc",
        },

      });

    return NextResponse.json(locations);

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        message: "保管場所取得失敗",
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

    const exists =
      await prisma.storageLocation.findFirst({

        where: {
          name: body.name,
        },

      });

    if (exists) {

      return NextResponse.json(exists);

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

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        message: "保管場所登録失敗",
      },
      {
        status: 500,
      }
    );

  }

}