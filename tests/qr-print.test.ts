import { expect, it } from "vitest";
import { qrPrintDocument } from "../src/lib/qr-print";
it("prints nine box labels per A4 page without shrinking the QR", () => {
  const html = qrPrintDocument(Array.from({length:10},()=>({name:'食品 <A>',image:'data:image/png;base64,AA=='})));
  expect(html.match(/class="sheet"/g)).toHaveLength(2);
  expect(html.match(/class="label"/g)).toHaveLength(10);
  expect(html).toContain('width:60mm;height:70mm');
  expect(html).toContain('width:50mm;height:50mm');
  expect(html).toContain('食品 &lt;A&gt;');
});
