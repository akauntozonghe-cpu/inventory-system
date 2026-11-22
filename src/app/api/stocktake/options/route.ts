import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLoggedInUser } from "@/lib/auth";
import { DEFAULT_UNITS, unitValidationMessage } from "@/lib/unit";

const uniqueSorted = (values: Array<string | null | undefined>) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ja"));
export const dynamic = "force-dynamic";

/** One source for registration, search, classification QR and stocktake choices. */
export async function GET(request: NextRequest) {
  if (!getLoggedInUser(request)) return NextResponse.json({ message: "ログイン情報を確認できませんでした。" }, { status: 401 });
  try {
    const [locations, inventories, masters, items] = await Promise.all([
      prisma.storageLocation.findMany({ where:{retiredAt:null}, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.inventoryInstance.findMany({ select: { unit: true }, distinct: ["unit"] }),
      prisma.classification.findMany({ select: { kind: true, name: true, parentName: true, retiredAt: true } }),
      prisma.item.findMany({ where: { isArchived: false }, select: { majorCategory: true, minorCategory: true, defaultUnit: true } }),
    ]);
    const retiredMajors=new Set(masters.filter(row=>row.kind==="MAJOR"&&row.retiredAt).map(row=>row.name));
    const retiredMinorPairs=new Set(masters.filter(row=>row.kind==="MINOR"&&row.retiredAt)
      .map(row=>JSON.stringify([row.parentName,row.name])));
    const availableMajor=(name:string|null|undefined)=>Boolean(name)&&!retiredMajors.has(name!);
    const availableMinor=(parentName:string,name:string)=>
      !retiredMajors.has(parentName)&&!retiredMinorPairs.has(JSON.stringify([parentName,name]));
    const minorPairs = [
      ...masters.filter((row) => row.kind === "MINOR"&&availableMinor(row.parentName,row.name))
        .map((row) => ({ name: row.name, parentName: row.parentName })),
      ...items.filter((item) => item.minorCategory && availableMinor(item.majorCategory??"",item.minorCategory))
        .map((item) => ({ name: item.minorCategory!, parentName: item.majorCategory ?? "" })),
    ];
    return NextResponse.json({
      success: true,
      storageLocations: locations.map((location) => location.name),
      storageLocationOptions: locations,
      majorCategories: uniqueSorted([...masters.filter((row) => row.kind === "MAJOR"&&!row.retiredAt).map((row) => row.name), ...items.map((item) => item.majorCategory).filter(availableMajor)]),
      minorCategories: uniqueSorted(minorPairs.map((row) => row.name)),
      minorCategoryOptions: [...new Map(minorPairs.map((row) => [JSON.stringify([row.parentName, row.name]), row])).values()],
      units: uniqueSorted([...DEFAULT_UNITS, ...items.map((item) => item.defaultUnit), ...inventories.map((row) => row.unit)]).filter((unit) => !unitValidationMessage(unit)),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET registration options", error);
    return NextResponse.json({ message: "分類・保管場所・単位の選択肢を取得できませんでした。" }, { status: 500 });
  }
}
