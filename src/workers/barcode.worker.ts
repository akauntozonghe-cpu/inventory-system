import { decodeCameraFrame } from "../lib/camera-frame";
self.onmessage = (event: MessageEvent<{
    buffer: ArrayBuffer;
    width: number;
    height: number;
    includeQr: boolean;
    sequence: number;
}>) => {
    const { buffer, width, height, includeQr, sequence } = event.data;
    const code = decodeCameraFrame(new Uint8ClampedArray(buffer), width, height, includeQr, sequence % 4 === 0);
    self.postMessage({ code, sequence });
};
