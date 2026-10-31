import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = vi.hoisted(() => ({ loggedIn: false }));
const search = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  requireLogin: () => state.loggedIn
    ? { user: { id: "worker" }, response: null }
    : { user: null, response: NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 }) },
}));
vi.mock("@/services/ItemService", () => ({ ItemService: { search } }));

import { GET } from "../src/app/api/items/search/route";
const request = (query: string) => GET(new NextRequest("http://localhost/api/items/search?q=" + encodeURIComponent(query)));

beforeEach(() => {
  vi.resetAllMocks();
  state.loggedIn = false;
  search.mockResolvedValue([{ id: "item", name: "サンプル" }]);
});

it("does not expose product search results without login", async () => {
  expect((await request("サンプル")).status).toBe(401);
  expect(search).not.toHaveBeenCalled();
});

it("normalizes input and searches only for logged-in users", async () => {
  state.loggedIn = true;
  const result = await request("ＡＢＣ");
  expect(result.status).toBe(200);
  expect(search).toHaveBeenCalledWith("ABC");
});
