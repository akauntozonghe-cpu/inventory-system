import { describe, expect, it } from "vitest";
import { pageWindow } from "../src/lib/pagination";
describe("一覧のページ範囲", () => {
  it("大量データでも表示は30件に限定し、最後の端数を残す", () => {
    expect(pageWindow(10001, 334)).toEqual({ page: 334, totalPages: 334, start: 9990, end: 10001, total: 10001 });
    expect(pageWindow(10001, 1).end).toBe(30);
  });
  it("他端末の変更で件数が減っても空のページに取り残さない", () => {
    expect(pageWindow(31, 20).page).toBe(2);
    expect(pageWindow(0, 20)).toEqual({ page: 1, totalPages: 1, start: 0, end: 0, total: 0 });
  });
});
