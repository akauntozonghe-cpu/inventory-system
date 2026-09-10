import { expect, it } from "vitest";
import sharp from "sharp";
import QRCode from "qrcode";
import { decodeCameraFrame } from "../src/lib/camera-frame";
import { cameraFormats } from "../src/lib/camera-decoder";
import { createScanGate } from "../src/lib/scan-gate";
import { barcodeLabel, barcodePrintDocument } from "../src/lib/barcode-label";
async function pixels(buffer: Buffer, rotate = 0) { return sharp(buffer, { density: 200 }).rotate(rotate).flatten({ background: "white" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); }
it("reads both JAN lengths from rendered labels, including a vertical label", async () => {
    for (const [code, angle] of [["4901234567894", 0], ["96385074", 0], ["4901234567894", 90]] as const) {
        const { data, info } = await pixels(Buffer.from(barcodeLabel(code).svg), angle);
        expect(decodeCameraFrame(new Uint8ClampedArray(data), info.width, info.height, true, true)).toBe(code);
    }
}, 20000);
it("reads numeric QR in mixed mode but never in continuous JAN mode", async () => {
    const { data, info } = await pixels(await QRCode.toBuffer("4901234567894", { width: 320 }));
    expect(decodeCameraFrame(new Uint8ClampedArray(data), info.width, info.height, true, true)).toBe("4901234567894");
    expect(decodeCameraFrame(new Uint8ClampedArray(data), info.width, info.height, false, true)).toBe(null);
    expect(cameraFormats(false)).not.toContain("qr_code");
}, 20000);
it("does not re-add the held barcode immediately after a long quantity-entry pause", () => {
    const gate = createScanGate();
    expect(gate("A", 0, false)).toBe(true);
    gate("", 10000, true);
    expect(gate("A", 10050, false)).toBe(false);
    expect(gate("B", 10100, false)).toBe(true);
});
it("uses smaller JAN-8 paper without shrinking the regulated symbol", () => {
    const html = barcodePrintDocument([{ name: "小箱", barcode: "96385074" }], "LABEL", 0.8, false);
    expect(html).toContain("size:24mm 20mm");
    expect(html).toContain('height="17.048mm"');
});
it("identifies the specific invalid product among a batch", () => {
    expect(() => barcodePrintDocument([{ name: "正常商品", barcode: "96385074" }, { name: "修正する商品", barcode: "123" }])).toThrow(/修正する商品.*123.*3文字/);
});
