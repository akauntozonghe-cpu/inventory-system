import { describe, expect, it } from "vitest";
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from "@zxing/library";
import QRCode from "qrcode";
import sharp from "sharp";
import { createProductReader, createScanGate } from "../src/lib/scan-reader";
import { barcodeLabel } from "../src/lib/barcode-label";

describe("shared JAN and QR reader", () => {
  it("decodes JAN-13, JAN-8 and QR with the same camera reader", async () => {
    const reader = createProductReader();
    for (const [code, input] of [
      ["4901234567894", Buffer.from(barcodeLabel("4901234567894").svg)],
      ["96385074", Buffer.from(barcodeLabel("96385074").svg)],
      ["inventory-lot-123", await QRCode.toBuffer("inventory-lot-123", { width: 320 })],
      ["4901234567894", await QRCode.toBuffer("4901234567894", { width: 320 })],
      ['{"type":"INVENTORY_CLASSIFICATION_LABEL","classificationLabelCode":"label-123","majorCategory":"食品"}', await QRCode.toBuffer('{"type":"INVENTORY_CLASSIFICATION_LABEL","classificationLabelCode":"label-123","majorCategory":"食品"}', { width: 640 })],
    ] as const) {
      const { data, info } = await sharp(input, { density: 300 }).flatten({ background: "white" }).greyscale().raw().toBuffer({ resolveWithObject: true });
      const pixels = new Uint8ClampedArray(info.width * info.height);
      for (let i = 0; i < pixels.length; i++) pixels[i] = data[i * info.channels];
      const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, info.width, info.height)));
      expect(reader.decodeBitmap(bitmap).getText()).toBe(code);
    }
  }, 20000);
  it("blocks held labels and paused input but accepts the next label without a 500ms wait", () => {
    const accept = createScanGate();
    expect(accept("A", 0, false)).toBe(true);
    for (let at = 60; at < 1800; at += 60) expect(accept("A", at, false)).toBe(false);
    expect(accept("B", 1800, false)).toBe(true);
    expect(accept("C", 2100, false)).toBe(true);
    expect(accept("D", 2400, true)).toBe(false);
    expect(accept("D", 2460, false)).toBe(false);
    expect(accept("D", 3800, false)).toBe(true);
  });
});
