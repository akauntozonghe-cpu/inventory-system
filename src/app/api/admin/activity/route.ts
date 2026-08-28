import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function dateRange(dateText: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const start = new Date(`${dateText}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function monthRange(monthText: string) {
  if (!/^\d{4}-\d{2}$/.test(monthText)) return null;
  const start = new Date(`${monthText}-01T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function japanDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.response) return auth.response;

  const date = request.nextUrl.searchParams.get("date") ?? "";
  const month = request.nextUrl.searchParams.get("month") ?? "";

  if (month) {
    const range = monthRange(month);
    if (!range) {
      return NextResponse.json({ code: "ACTIVITY_MONTH_400", message: "確認する月を指定してください。" }, { status: 400 });
    }
    const [items, records, events, actions] = await Promise.all([
      prisma.item.findMany({ where: { createdAt: { gte: range.start, lt: range.end } }, select: { createdAt: true } }),
      prisma.stocktakeRecord.findMany({ where: { updatedAt: { gte: range.start, lt: range.end } }, select: { updatedAt: true } }),
      prisma.inventoryEvent.findMany({ where: { createdAt: { gte: range.start, lt: range.end } }, select: { createdAt: true } }),
      prisma.adminActionLog.findMany({ where: { createdAt: { gte: range.start, lt: range.end } }, select: { createdAt: true } }),
    ]);
    const days: Record<string, number> = {};
    for (const value of [
      ...items.map((entry) => entry.createdAt),
      ...records.map((entry) => entry.updatedAt),
      ...events.map((entry) => entry.createdAt),
      ...actions.map((entry) => entry.createdAt),
    ]) {
      const key = japanDateKey(value);
      days[key] = (days[key] ?? 0) + 1;
    }
    return NextResponse.json({ month, days });
  }

  const range = dateRange(date);
  if (!range) {
    return NextResponse.json(
      { code: "ACTIVITY_DATE_400", message: "確認する日付を指定してください。" },
      { status: 400 }
    );
  }

  try {
    const [items, records, inventoryEvents, adminActions] = await Promise.all([
      prisma.item.findMany({
        where: { createdAt: { gte: range.start, lt: range.end } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          janCode: true,
          systemBarcode: true,
          createdAt: true,
        },
      }),
      prisma.stocktakeRecord.findMany({
        where: { updatedAt: { gte: range.start, lt: range.end } },
        orderBy: { updatedAt: "asc" },
        select: {
          id: true,
          countedQuantity: true,
          updatedAt: true,
          session: { select: { id: true, title: true, operator: true } },
          inventoryInstance: { select: { item: { select: { id: true, name: true } } } },
        },
      }),
      prisma.inventoryEvent.findMany({
        where: { createdAt: { gte: range.start, lt: range.end } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          eventType: true,
          quantityChange: true,
          quantityAfter: true,
          reason: true,
          createdAt: true,
          performedBy: { select: { displayName: true } },
          inventoryInstance: { select: { item: { select: { id: true, name: true } } } },
        },
      }),
      prisma.adminActionLog.findMany({
        where: { createdAt: { gte: range.start, lt: range.end } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          action: true,
          route: true,
          detail: true,
          createdAt: true,
          adminUser: { select: { displayName: true } },
        },
      }),
    ]);

    return NextResponse.json({
      date,
      summary: {
        registeredItems: items.length,
        stocktakeRecords: records.length,
        inventoryEvents: inventoryEvents.length,
        adminActions: adminActions.length,
      },
      items,
      records,
      inventoryEvents,
      adminActions,
    });
  } catch (error) {
    console.error("GET /api/admin/activity", error);
    return NextResponse.json(
      { code: "ACTIVITY_FETCH_500", message: "日付別の作業履歴を取得できませんでした。" },
      { status: 500 }
    );
  }
}
