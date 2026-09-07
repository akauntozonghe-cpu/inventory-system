import { describe, expect, it } from "vitest";
import { matchesStocktakeGroup } from "../src/lib/stocktake-groups";
describe("棚卸の状態別表示", () => {
  it("各状態が一つの区分だけに入り、確認待ちを作業中へ混ぜない", () => {
    const states = { IN_PROGRESS: "ACTIVE", PAUSED: "ACTIVE", REVIEW: "ISSUES", CONFLICT: "ISSUES", COMPLETED: "COMPLETED", CANCELLED: "COMPLETED" } as const;
    for (const [status, expected] of Object.entries(states)) {
      expect(["ACTIVE", "ISSUES", "COMPLETED"].filter(group => matchesStocktakeGroup(status, group as "ACTIVE" | "ISSUES" | "COMPLETED"))).toEqual([expected]);
      expect(matchesStocktakeGroup(status, "ALL")).toBe(true);
    }
  });
});
