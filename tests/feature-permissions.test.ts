import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKER_FEATURES,
  normalizeFeaturePermissions,
  requiredFeature,
} from "../src/lib/feature-permissions";

describe("feature permissions", () => {
  it("不正値と重複を除外して既定順へ揃える", () => {
    expect(
      normalizeFeaturePermissions([
        "CATALOG",
        "UNKNOWN",
        "CATALOG",
        "STOCKTAKE",
      ])
    ).toEqual(["STOCKTAKE", "CATALOG"]);
  });

  it("既存作業者は全日常機能を引き続き利用できる", () => {
    expect(DEFAULT_WORKER_FEATURES).toEqual([
      "STOCKTAKE",
      "CATALOG",
      "STOCKTAKE_HISTORY",
    ]);
  });

  it.each([
    ["/stocktake/start", "GET", "STOCKTAKE"],
    ["/api/stocktake/record", "POST", "STOCKTAKE"],
    ["/inventory-search", "GET", "CATALOG"],
    ["/api/inventory/search", "GET", "CATALOG"],
    ["/items/abc", "GET", "CATALOG"],
    ["/api/items", "GET", "CATALOG"],
    ["/stocktake/history", "GET", "STOCKTAKE_HISTORY"],
    ["/api/stocktake/register-item", "POST", "ITEM_REGISTER"],
    ["/admin/users", "GET", null],
  ])("%s %s の必要権限を判定する", (path, method, expected) => {
    expect(requiredFeature(path, method)).toBe(expected);
  });

  it("棚卸セッション内の在庫検索は棚卸権限で許可する", () => {
    expect(requiredFeature("/api/inventory/search", "GET", true)).toBe("STOCKTAKE");
  });
});
