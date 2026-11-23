import {describe,expect,it} from "vitest";
import {sortPrintLabels} from "../src/lib/print-order";
import {barcodePrintDocument} from "../src/lib/barcode-label";
import {qrPrintDocument} from "../src/lib/qr-print";

describe("print order and detachable barcode guide",()=>{
  it("sorts numeric Japanese names naturally, independently of user selection order",()=>{
    expect(sortPrintLabels([
      {name:"フリマ10",barcode:"4901234567894"},
      {name:"フリマ2",barcode:"4901234567894"},
      {name:"フリマ1",barcode:"4901234567894"},
    ],"BARCODE").map(x=>x.name)).toEqual(["フリマ1","フリマ2","フリマ10"]);
  });
  it("sorts QR categories by major, minor, location and numeric name on paper",()=>{
    const html=qrPrintDocument([
      {name:"棚10",kind:"保管場所",image:"data:image/png;base64,AA=="},
      {name:"大10",kind:"大分類",image:"data:image/png;base64,AA=="},
      {name:"大2",kind:"大分類",image:"data:image/png;base64,AA=="},
      {name:"大2 ／ 小10",kind:"小分類",image:"data:image/png;base64,AA=="},
      {name:"大2 ／ 小2",kind:"小分類",image:"data:image/png;base64,AA=="},
      {name:"棚2",kind:"保管場所",image:"data:image/png;base64,AA=="},
    ]);
    const names=[...html.matchAll(/<h1>([^<]+)<\/h1>/g)].map(m=>m[1]);
    expect(names).toEqual(["大2","大10","大2 ／ 小2","大2 ／ 小10","棚2","棚10"]);
  });
  it("places optional product name and JAN on removable guide, never inside sticker",()=>{
    const html=barcodePrintDocument([
      {name:"商品10 <特殊>",barcode:"4901234567894"},
      {name:"商品2",barcode:"96385074"},
    ],"A4",0.8,true);
    const stickers=[...html.matchAll(/<div class="sticker"[^>]*>([\s\S]*?)<\/div>/g)].map(m=>m[1]);
    expect(stickers).toHaveLength(2);
    expect(stickers.every(x=>x.startsWith("<svg"))).toBe(true);
    expect(stickers.every(x=>!x.includes("商品")&&!x.includes("guide"))).toBe(true);
    expect(html).toContain('class="guide"');
    expect(html).toContain("JAN：96385074");
    expect(html).toContain("商品10 &lt;特殊&gt;");
    expect(html).toContain("border-bottom:.25mm dashed");
    expect(html.indexOf("商品2")).toBeLessThan(html.indexOf("商品10 &lt;特殊&gt;"));
  });
  it("keeps barcode-only sticker compact and excludes the name guide when unchecked",()=>{
    const html=barcodePrintDocument([{name:"この名前は貼付部分に不要",barcode:"4901234567894"}],"LABEL",0.8,false);
    expect(html).not.toContain('class="guide"');
    expect(html).not.toContain("この名前は貼付部分に不要");
    expect(html).toContain('aria-label="4901234567894"');
    expect(html).toContain('size:32mm 23mm');
  });
  it("keeps human-readable JAN digits inside the barcode sticker at actual size",()=>{
    const html=barcodePrintDocument([{name:"確認",barcode:"4901234567894"}],"LABEL",1,true);
    expect(html).toContain('aria-label="4901234567894"');
    expect(html).toContain('width="37.290mm"');
    expect(html).toContain('class="sticker"');
    expect(html).toContain('class="guide"');
  });
});
