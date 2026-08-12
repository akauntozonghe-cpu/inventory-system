import { NextRequest, NextResponse } from "next/server";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * 旧API互換用。
 * 正式反映は /api/stocktake/session/[id] の COMPLETE 操作へ一本化した。
 */
export async function POST(
  _request: NextRequest,
  { params }: Params
) {
  const { id } = await params;

  return NextResponse.json(
    {
      code: "STOCKTAKE_APPLY_DEPRECATED",
      message:
        "棚卸の正式反映は、棚卸画面の「終了」操作で自動的に行われます。二重反映防止のため、この操作は利用できません。",
      sessionId: id,
    },
    { status: 410 }
  );
}