import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_ZAICO_ROWS, decideZaicoRow, normalizeZaicoRow } from "@/lib/zaico-import";
import { previewZaico, processZaico, processPendingSystemJan, type ReviewInput } from "@/lib/zaico-import-service";

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const cursor = request.nextUrl.searchParams.get("historyCursor");
    if (cursor) {
      const recent = await prisma.zaicoImportRecord.findMany({ where: { status: { not: "PENDING" } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 21, cursor: { id: cursor }, skip: 1 });
      return NextResponse.json({ recent: recent.slice(0,20), nextHistoryCursor: recent.length > 20 ? recent[19].id : null }, { headers: { "Cache-Control": "no-store" } });
    }
    const [pending, count, recent, items] = await Promise.all([
      prisma.zaicoImportRecord.findMany({ where: { status: "PENDING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 }),
      prisma.zaicoImportRecord.count({ where: { status: "PENDING" } }),
      prisma.zaicoImportRecord.findMany({ where: { status: { not: "PENDING" } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 21 }),
      prisma.item.findMany({ select: { id: true, name: true, janCode: true, isArchived: true } }),
    ]);
    return NextResponse.json({ pending: pending.map(record => ({ ...record, candidates: decideZaicoRow(normalizeZaicoRow(record.row), items).candidates })), count, recent: recent.slice(0,20), nextHistoryCursor: recent.length > 20 ? recent[19].id : null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "取り込み履歴を取得できませんでした。再読み込みしてください。" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;
  if (!auth.user) return NextResponse.json({ message: "管理者権限が必要です。" }, { status: 403 });
  try {
    const body = await request.json().catch(() => null);
    if (body?.action === "SYSTEM_JAN_PENDING") return NextResponse.json(await processPendingSystemJan(auth.user.id));
    if (!["PREVIEW", "IMPORT", "REVIEW"].includes(body?.action)) return NextResponse.json({ message: "処理方法を確認してください。" }, { status: 400 });
    const values: unknown = body.action === "REVIEW" ? body.reviews : body.rows;
    if (!Array.isArray(values) || values.length === 0 || values.length > MAX_ZAICO_ROWS || JSON.stringify(values).length > 2_000_000) return NextResponse.json({ message: `1〜${MAX_ZAICO_ROWS}行のファイルを選んでください。` }, { status: 400 });
    if (body.action === "REVIEW") {
      if (values.some(v => !v || typeof v.id !== "string" || !v.id || !["AUTO", "NEW_NO_JAN", "LINK", "SKIP"].includes(v.mode)) || new Set(values.map(v => v.id)).size !== values.length) return NextResponse.json({ message: "確認待ちの選択内容を確認してください。" }, { status: 400 });
      return NextResponse.json(await processZaico({ reviews: values as ReviewInput[] }, auth.user.id));
    }
    const rows = values.map(normalizeZaicoRow);
    if (body.action === "PREVIEW") return NextResponse.json({ preview: await previewZaico(rows) });
    return NextResponse.json(await processZaico({ rows }, auth.user.id));
  } catch {
    return NextResponse.json({ message: "取り込みを完了できませんでした。再試行しても同じ内容は重複登録されません。" }, { status: 503 });
  }
}
