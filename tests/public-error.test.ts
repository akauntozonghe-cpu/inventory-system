import { expect, it } from "vitest";
import { publicErrorMessage } from "../src/lib/public-error";
it("does not turn database errors into UI messages", () => {
  expect(publicErrorMessage(new Error('SELECT secret FROM "Item"'), "再試行してください。")).toBe("再試行してください。");
});
