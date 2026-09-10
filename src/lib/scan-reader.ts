import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

// All product-camera entry points accept the same JAN, QR and existing label formats.
export function createProductReader(includeQr = true) {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
    BarcodeFormat.ITF, BarcodeFormat.CODABAR, ...(includeQr ? [BarcodeFormat.QR_CODE] : []),
  ]);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 60,
    delayBetweenScanSuccess: 60,
  });
}

export {createScanGate} from "./scan-gate";
