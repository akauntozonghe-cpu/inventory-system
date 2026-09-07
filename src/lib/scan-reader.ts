import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

// All product-camera entry points accept the same JAN, QR and existing label formats.
export function createProductReader() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
    BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.QR_CODE,
  ]);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 60,
    delayBetweenScanSuccess: 60,
  });
}

export function createScanGate() {
  let last = { code: "", at: -Infinity };
  let acceptedAt = -Infinity;
  return (code: string, now: number, paused: boolean) => {
    const duplicate = code === last.code && now - last.at < 1200;
    if (!code) return false;
    if (paused || duplicate) { last = { code, at: now }; return false; }
    // A new label seen during the short throttle must remain eligible next frame.
    if (now - acceptedAt < 250) return false;
    last = { code, at: now };
    acceptedAt = now;
    return true;
  };
}
