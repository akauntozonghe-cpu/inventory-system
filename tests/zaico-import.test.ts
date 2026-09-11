import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { decideZaicoRow, mapZaicoRows, normalizeZaicoRow, validJan } from "../src/lib/zaico-import";

const row = normalizeZaicoRow({ name: "シャツスプレー", janCode: "4987379007563", quantity: "4", unit: "本" });
describe("zaico import decisions", () => {
  it("maps only relevant fields and permits missing location", () => {
    const mapped = mapZaicoRows([{ 在庫ID: 53366159, 物品名: row.name, 数量: 4, 単位: "本", "QRコード・バーコードの値": row.janCode, 保管場所: "", カテゴリ: "日用品" }])[0];
    expect(mapped).toEqual({ ...row, majorCategory: "日用品" });
    expect(decideZaicoRow(mapped, []).status).toBe("CREATE");
  });
  it("links by JAN without relying on names or source IDs", () => {
    expect(decideZaicoRow(row, [{ id: "other", name: "別の表記", janCode: row.janCode, isArchived: false }])).toMatchObject({ status: "LINK", itemId: "other" });
    expect(decideZaicoRow(row, [{ id: "same-name", name: row.name, janCode: "4901234567894", isArchived: false }]).status).toBe("CREATE");
  });
  it("requires review for absent, rounded, invalid or ambiguous JAN", () => {
    for (const janCode of ["", "4.98738E+12", "4987379007564", "123"]) expect(decideZaicoRow({ ...row, janCode }, []).status).toBe("PENDING");
    const item = { id: "a", name: "商品", janCode: row.janCode, isArchived: false };
    expect(decideZaicoRow(row, [item, { ...item, id: "b" }]).status).toBe("PENDING");
    expect(decideZaicoRow(row, [{ ...item, isArchived: true }]).status).toBe("PENDING");
  });
  it("requires an explicit choice for a new product without JAN", () => {
    expect(decideZaicoRow({ ...row, janCode: "" }, [], true).status).toBe("CREATE");
    expect(decideZaicoRow({ ...row, janCode: "bad" }, [], true).status).toBe("PENDING");
  });
  it("rejects quantities that cannot be stored without losing information", () => {
    for (const quantity of ["", "-1", "1.5", "1e3", "2147483648"]) expect(decideZaicoRow({ ...row, quantity }, []).status).toBe("PENDING");
    expect(decideZaicoRow({ ...row, quantity: "0" }, []).status).toBe("CREATE");
  });
  it("preserves leading zeroes and quoted commas when reading CSV", () => {
    const book = XLSX.read('物品名,数量,QRコード・バーコードの値\n"商品,赤",4,01234565', { type: "string", raw: true });
    const mapped = mapZaicoRows(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { raw: false, defval: "" }));
    expect(mapped[0]).toMatchObject({ name: "商品,赤", janCode: "01234565", quantity: "4" });
    expect(validJan("01234565")).toBe(true);
  });
});
