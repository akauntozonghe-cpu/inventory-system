import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = requireLogin(request);
  if (auth.response) return auth.response;
  const labelCode = request.nextUrl.searchParams.get("labelCode")?.trim() ?? "";
  if (!labelCode) return NextResponse.json({ code: "CLASSIFICATION_LABEL_REQUIRED", message: "分類ラベルコードがありません。" }, { status: 400 });
  const direct = await prisma.classification.findUnique({ where: { labelCode }, select: { id: true, labelCode: true, kind: true, name: true, parentName: true, updatedAt: true } });
  const classification = direct ?? (await prisma.classificationLabelAlias.findUnique({ where: { labelCode }, select: { classification: { select: { id: true, labelCode: true, kind: true, name: true, parentName: true, updatedAt: true } } } }))?.classification;
  if (!classification || classification.kind !== "MAJOR") return NextResponse.json({ code: "CLASSIFICATION_LABEL_NOT_FOUND", message: "この分類ラベルは現在の大分類にリンクしていません。分類管理で確認してください。" }, { status: 404 });
  return NextResponse.json({ code: "CLASSIFICATION_LABEL_RESOLVED", classification });
}
