import { expect, it } from "vitest";
import { matchesSessionSearch } from "../src/lib/session-search";
it("棚卸名・範囲・担当者を同じ検索規則で探せる", () => {
  const session = { title: "９月棚卸", scopeLabel: "冷蔵庫A", operatorUser: { displayName: "山田", username: "worker1" } };
  expect(matchesSessionSearch(session, "9月　山田")).toBe(true);
  expect(matchesSessionSearch(session, "冷蔵庫ａ WORKER1")).toBe(true);
  expect(matchesSessionSearch(session, "冷凍庫")).toBe(false);
  expect(matchesSessionSearch(session, " ")).toBe(true);
});
