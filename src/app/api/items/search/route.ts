import { NextRequest, NextResponse } from "next/server";
import { ItemService } from "@/services/ItemService";
import { requireLogin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireLogin(req);
  if (auth.response) return auth.response;
  try {
    const keyword =
      req.nextUrl.searchParams.get("q")?.normalize("NFKC").trim() ?? "";

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
