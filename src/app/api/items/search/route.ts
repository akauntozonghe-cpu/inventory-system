import { NextRequest, NextResponse } from "next/server";
import { ItemService } from "@/services/ItemService";

export async function GET(req: NextRequest) {
  try {
    const keyword =
      req.nextUrl.searchParams.get("q")?.trim() ?? "";

    const items = await ItemService.search(keyword);

    return NextResponse.json(items);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "検索に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}