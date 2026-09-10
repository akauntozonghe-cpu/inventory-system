import { BarcodeFormat, DecodeHintType, MultiFormatOneDReader, QRCodeReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from "@zxing/library";
const readers = new Map<string, {
    oneD: MultiFormatOneDReader;
    qr: QRCodeReader;
    hints: Map<DecodeHintType, unknown>;
}>();
export function decodeCameraFrame(data: Uint8ClampedArray, width: number, height: number, includeQr: boolean, tryHarder = false) {
    const key = `${includeQr}:${tryHarder}`;
    let reader = readers.get(key);
    if (!reader) {
        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF, BarcodeFormat.CODABAR, ...(includeQr ? [BarcodeFormat.QR_CODE] : [])]);
        if (tryHarder)
            hints.set(DecodeHintType.TRY_HARDER, true);
        reader = { oneD: new MultiFormatOneDReader(hints), qr: new QRCodeReader(), hints };
        readers.set(key, reader);
    }
    const pixels = new Uint8ClampedArray(width * height);
    for (let i = 0; i < pixels.length; i++) {
        const j = i * 4;
        pixels[i] = (data[j] + 2 * data[j + 1] + data[j + 2]) / 4;
    }
    const decode = (values: Uint8ClampedArray, w: number, h: number) => { const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(values, w, h))); try {
        return reader!.oneD.decode(bitmap, reader!.hints).getText();
    }
    catch {
        if (includeQr)
            return reader!.qr.decode(bitmap, reader!.hints).getText();
        throw new Error("NO_CODE");
    } };
    try {
        return decode(pixels, width, height);
    }
    catch {
        if (tryHarder) {
            const rotated = new Uint8ClampedArray(pixels.length);
            for (let y = 0; y < height; y++)
                for (let x = 0; x < width; x++)
                    rotated[x * height + height - y - 1] = pixels[y * width + x];
            try {
                return decode(rotated, height, width);
            }
            catch { /* Next frame. */ }
        }
        return null;
    }
    finally {
        reader.oneD.reset();
        reader.qr.reset();
    }
}
