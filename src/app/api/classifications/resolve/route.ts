import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = requireLogin(request);
  if (auth.response) return auth.response;
  const labelCode = request.nextUrl.searchParams.get("labelCode")?.trim() ?? "";
  if (!labelCode) return NextResponse.json({ code: "CLASSIFICATION_LABEL_REQUIRED", message: "分類ラベルコードがありません。" }, { status: 400 });
  const direct = await prisma.classification.findUnique({ where: { labelCode }, select: { id: true, labelCode: true, kind: true, name: true, parentName: true, retiredAt:true, updatedAt: true } });
  const classification = direct ?? (await prisma.classificationLabelAlias.findUnique({ where: { labelCode }, select: { classification: { select: { id: true, labelCode: true, kind: true, name: true, parentName: true, updatedAt: true } } } }))?.classification;
  if (classification?.retiredAt) return NextResponse.json({code:"CLASSIFICATION_LABEL_RETIRED",message:"このQRは廃止済みの分類です。通常業務には使用できません。管理者は廃止記録を確認してください。"},{status:410});
  if(classification?.kind==="MINOR"){
    const parent=await prisma.classification.findUnique({where:{kind_name_parentName:{kind:"MAJOR",name:classification.parentName,parentName:""}},select:{id:true,retiredAt:true}});
    if(!parent||parent.retiredAt)return NextResponse.json({code:"CLASSIFICATION_LABEL_PARENT_RETIRED",message:"この小分類の大分類は廃止済みまたは未登録です。"},{status:410});
  }
  if (!classification || (classification.kind !== "MAJOR" && !(classification.kind==="MINOR" && request.nextUrl.searchParams.get("allowMinor")==="true"))) return NextResponse.json({ code: "CLASSIFICATION_LABEL_NOT_FOUND", message: "この分類ラベルは現在の大分類にリンクしていません。分類管理で確認してください。" }, { status: 404 });
  return NextResponse.json({ code: "CLASSIFICATION_LABEL_RESOLVED", classification });
}
