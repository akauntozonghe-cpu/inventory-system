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
  it("issues a system JAN for absent or invalid codes but reviews ambiguous matches", () => {
    for (const janCode of ["", "4.98738E+12", "4987379007564", "123"]) expect(decideZaicoRow({ ...row, janCode }, []).status).toBe("CREATE");
    const item = { id: "a", name: "商品", janCode: row.janCode, isArchived: false };
    expect(decideZaicoRow(row, [item, { ...item, id: "b" }]).status).toBe("PENDING");
    expect(decideZaicoRow(row, [{ ...item, isArchived: true }]).status).toBe("PENDING");
  });
  it("accepts old no-JAN review mode with automatic assignment", () => {
    expect(decideZaicoRow({ ...row, janCode: "" }, [], true).status).toBe("CREATE");
    expect(decideZaicoRow({ ...row, janCode: "bad" }, [], true).status).toBe("CREATE");
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

it("reads generic and legacy columns without dropping lot or expiry",()=>{
  const mapped=mapZaicoRows([{品名:"白い皿",個数:"6",個数単位:"枚",大分類:"食器",小分類:"皿",期限:"2028/2/29","Lot.No・製造番号":"LOT-A"}])[0];
  expect(mapped).toMatchObject({name:"白い皿",quantity:"6",unit:"枚",majorCategory:"食器",minorCategory:"皿",lotNo:"LOT-A",expirationDate:"2028/2/29"});
  expect(decideZaicoRow(mapped,[]).status).toBe("CREATE");
  expect(decideZaicoRow({...mapped,expirationDate:"2027/2/29"},[]).status).toBe("PENDING");
  expect(decideZaicoRow({...mapped,quantity:"-1"},[]).status).toBe("PENDING");
});
it("does not duplicate an existing item with the same invalid barcode",()=>{
  expect(decideZaicoRow({...row,janCode:"bad"},[{id:"existing",name:"商品",janCode:"bad",isArchived:false}]).status).toBe("PENDING");
});

it("maps image file names and URLs without inventing associations",()=>{
const result=mapZaicoRows([{商品名:"皿",数量:"6",写真1:"plate.jpg",写真2:"plate-back.jpg",写真URL:"https://example.com/image.png"}])[0];
expect(result.photoRefs).toEqual(["https://example.com/image.png","plate.jpg","plate-back.jpg"]);
expect(mapZaicoRows([{物品名:"皿",数量:"6",在庫ID:"123"}])[0].photoRefs).toBeUndefined();
});
