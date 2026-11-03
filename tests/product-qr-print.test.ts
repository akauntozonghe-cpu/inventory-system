import {describe,expect,it} from "vitest";
import QRCode from "qrcode";
import {parseScan} from "../src/lib/scan-payload";
import {productQrPrintDocument} from "../src/lib/product-qr-print";
import {generateSystemJan} from "../src/lib/system-jan";

const qrImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==";
const row = (name="商品",barcode="4901234567894")=>({name,barcode,image:qrImage});

describe("batch product JAN and QR labels",()=>{
 it("embeds exactly the registered JAN or system JAN in a QR readable by the existing scanner",async()=>{
  for(const code of ["4901234567894",generateSystemJan(),"SYS-AB12-CD3456"]){
   const dataUrl=await QRCode.toDataURL(code,{width:600,margin:2,errorCorrectionLevel:"M"});
   expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
   expect(parseScan(code)).toEqual({type:"ITEM",code});
   const html=productQrPrintDocument([{name:"商品",barcode:code,image:dataUrl}],"QR");
   expect(html).toContain("商品QR");
   expect(html).toContain(dataUrl);
   expect(html).toContain(code);
  }
 });
 it("prints each product exactly once with both JAN and QR on the same label",()=>{
  const html=productQrPrintDocument([row("お茶"),row("お菓子")],"BOTH");
  expect(html.match(/<article class="label">/g)).toHaveLength(2);
  expect(html.match(/class="qr"/g)).toHaveLength(2);
  expect(html.match(/class="barcode"/g)).toHaveLength(2);
  expect(html).toContain('width="29.832mm"');
  expect(html).toContain("お茶");
 });
 it("fits nine labels on A4 and starts a new page for the tenth",()=>{
  const html=productQrPrintDocument(Array.from({length:10},(_,i)=>row("商品"+i)),"QR","A4");
  expect(html.match(/<main class="sheet">/g)).toHaveLength(2);
  expect(html.match(/<article class="label">/g)).toHaveLength(10);
  expect(html).toContain("@page{size:A4 portrait;margin:8mm}");
 });
 it("uses one 60x70mm label per page with a label printer",()=>{
  const html=productQrPrintDocument([row(),row()],"BOTH","LABEL");
  expect(html).toContain("@page{size:60mm 70mm;margin:0}");
  expect(html.match(/<main class="sheet">/g)).toHaveLength(2);
 });
 it("rejects invalid JAN and unsafe QR images before producing HTML",()=>{
  expect(()=>productQrPrintDocument([row("不正","4901234567890")],"QR")).toThrow("検査数字");
  expect(()=>productQrPrintDocument([row("不正","")],"QR")).toThrow();
  expect(()=>productQrPrintDocument([{...row(),image:"javascript:alert(1)"}],"QR")).toThrow("QR画像");
 });
 it("escapes user-editable product names and shows safe codes",()=>{
  const html=productQrPrintDocument([row("<img src=x onerror=alert(1)>")],"BOTH");
  expect(html).not.toContain('<img src=x onerror=alert(1)>');
  expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  expect(html).toContain('4901234567894');
 });
 it("keeps existing category QR and JAN-only render paths separate",()=>{
  // This product layout is used only for QR or JAN+QR; standalone JAN
  // continues to use barcodePrintDocument, and category QR uses qrPrintDocument.
  expect(()=>productQrPrintDocument([row()],"BARCODE" as never)).toThrow("印刷形式");
 });
});
