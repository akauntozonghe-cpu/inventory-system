import { beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({ storageLocation: { findMany: vi.fn() }, inventoryInstance: { findMany: vi.fn() }, classification: { findMany: vi.fn() }, item: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ getLoggedInUser: () => ({ id: "worker" }) }));
import { GET } from "../src/app/api/stocktake/options/route";

describe("shared selection options", () => {
  beforeEach(() => {
    db.storageLocation.findMany.mockResolvedValue([{ id: "location", name: "新しい棚" }]);
    db.inventoryInstance.findMany.mockResolvedValue([{ unit: "0" }, { unit: "束" }]);
    db.item.findMany.mockResolvedValue([{ majorCategory: "食品", minorCategory: "飲料", defaultUnit: "箱" }]);
    db.classification.findMany.mockResolvedValue([{ kind: "MAJOR", name: "まだ商品がない分類", parentName: "" }, { kind: "MINOR", name: "飲料", parentName: "備蓄品" }]);
  });
  it("includes a newly created but unused category for worker search and registration", async () => {
    const response = await GET(new NextRequest("http://localhost/api/stocktake/options"));
    const options = await response.json();
    expect(options.majorCategories).toContain("まだ商品がない分類");
    expect(options.storageLocationOptions).toEqual([{ id: "location", name: "新しい棚" }]);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("keeps parent-specific minor choices and shares custom units without numeric corruption", async () => {
    const options = await (await GET(new NextRequest("http://localhost/api/stocktake/options"))).json();
    expect(options.minorCategoryOptions).toEqual(expect.arrayContaining([{ name: "飲料", parentName: "食品" }, { name: "飲料", parentName: "備蓄品" }]));
    expect(options.units).toContain("束");
    expect(options.units).not.toContain("0");
  });
});
