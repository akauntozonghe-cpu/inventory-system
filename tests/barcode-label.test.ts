import { describe, expect, it } from "vitest";
import { BitArray, MultiFormatOneDReader } from "@zxing/library";
import sharp from "sharp";
import { barcodeLabel, barcodePrintDocument } from "../src/lib/barcode-label";

describe("product barcode labels", () => {
  it.each([0.8, 1] as const)("retains GS1 dimensions and quiet zones at %s", (scale) => {
    const label = barcodeLabel("4901234567894", scale);
    expect(label.width).toBeCloseTo(37.29 * scale);
    expect(label.height).toBeCloseTo(25.93 * scale);
    expect(label.quietLeft).toBeCloseTo(3.63 * scale);
    expect(label.quietRight).toBeCloseTo(2.31 * scale);
    expect(label.moduleWidth).toBeGreaterThanOrEqual(0.264);
    expect(label.bits.length).toBe(95);
  });
  it.each(["4901234567894", "96385074"])("decodes the actual printed SVG at 300dpi: %s", async (code) => {
    const label = barcodeLabel(code);
    const { data, info } = await sharp(Buffer.from(label.svg), { density: 300 }).flatten({ background: "white" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const row = new BitArray(info.width);
    const y = Math.floor(info.height / 3);
    for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * info.channels] < 128) row.set(x);
    const reader = new MultiFormatOneDReader();
    expect(reader.decodeRow(y, row, new Map()).getText()).toBe(code);
  }, 20000);
  it("rejects invalid checksums without printing an old or substituted barcode", () => {
    expect(() => barcodeLabel("4901234567890")).toThrow("検査数字");
    expect(() => barcodeLabel("123")).toThrow("8桁または13桁");
  });
  it("paginates 61 small JAN labels into two A4 sheets without browser shrinking", () => {
    const html = barcodePrintDocument(Array.from({ length: 61 }, () => ({ name: '<script>alert("x")</script>', barcode: "4901234567894" })));
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html.match(/class="label"/g)).toHaveLength(61);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('width:32mm;height:26mm');
    expect(html).toContain('width="29.832mm" height="20.744mm"');
  });
  it("uses one page per label with the same physical barcode as A4", () => {
    const html = barcodePrintDocument([{ name: "商品", barcode: "4901234567894" }, { name: "商品", barcode: "4901234567894" }], "LABEL");
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html).toContain('size:32mm 26mm');
  });
  it("keeps legacy SYS labels wide enough instead of crushing CODE128", () => {
    const label = barcodeLabel("SYS-AB12-CD3456");
    expect(label.labelWidth).toBeGreaterThan(36);
    expect(label.width).toBeCloseTo((label.bits.length + 20) * 0.264);
  });
});
