type NativeResult = {
    rawValue: string;
    format: string;
};
type NativeDetector = {
    detect: (source: HTMLCanvasElement) => Promise<NativeResult[]>;
};
type NativeConstructor = {
    new (options: {
        formats: string[];
    }): NativeDetector;
    getSupportedFormats: () => Promise<string[]>;
};
export const cameraFormats = (includeQr: boolean) => ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", ...(includeQr ? ["qr_code"] : [])];
/** One frame in flight. Native acceleration first; decoding fallback runs off the UI thread. */
export async function startCameraDecoder(video: HTMLVideoElement, options: {
    includeQr: boolean;
    paused: () => boolean;
    onResult: (value: string) => void;
    onError: (message: string) => void;
}) {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, worker: Worker | undefined, native: NativeDetector | null = null;
    let pending = false, sequence = 0, pausedGeneration = 0, pendingGeneration = 0, lastFallback = 0;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    const stop = () => { stopped = true; clearTimeout(timer); worker?.terminate(); stream.getTracks().forEach(track => track.stop()); if (video.srcObject === stream)
        video.srcObject = null; };
    try {
        video.srcObject = stream;
        await video.play();
        const Native = (globalThis as typeof globalThis & {
            BarcodeDetector?: NativeConstructor;
        }).BarcodeDetector;
        // Query capabilities independently so platform startup cannot hold up the camera.
        if (Native)
            void Native.getSupportedFormats().then(formats => { if (!stopped) {
                const supported = cameraFormats(options.includeQr).filter(format => formats.includes(format));
                if (supported.length)
                    native = new Native({ formats: supported });
            } }).catch(() => { });
        worker = new Worker(new URL("../workers/barcode.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<{
            code: string | null;
            sequence: number;
        }>) => { pending = false; if (!stopped && !options.paused() && pendingGeneration === pausedGeneration && event.data.sequence === sequence && event.data.code)
            options.onResult(event.data.code); };
        worker.onerror = () => { pending = false; worker?.terminate(); worker = undefined; if (!native)
            options.onError("SCAN_ENGINE_FAILED：読取処理を起動できませんでした。一度カメラを閉じて開き直してください。"); };
        const canvas = document.createElement("canvas"), context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context)
            throw new Error("SCAN_CANVAS_FAILED");
        const tick = () => void frame().catch(() => { if (!stopped)
            options.onError("SCAN_FRAME_FAILED：カメラの映像を確認できません。閉じて開き直してください。"); });
        const frame = async () => {
            if (stopped)
                return;
            if (options.paused()) {
                pausedGeneration++;
                timer = setTimeout(tick, 70);
                return;
            }
            if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
                // Decode exactly the visible camera image; avoid labels cropped out by object-cover.
                const cover = getComputedStyle(video).objectFit === "cover";
                const ratio = video.clientWidth / Math.max(1, video.clientHeight);
                let sw = video.videoWidth, sh = video.videoHeight;
                if (cover && ratio > 0) {
                    if (sw / sh > ratio)
                        sw = sh * ratio;
                    else
                        sh = sw / ratio;
                }
                const scale = Math.min(1, 1280 / Math.max(sw, sh));
                canvas.width = Math.max(1, Math.round(sw * scale));
                canvas.height = Math.max(1, Math.round(sh * scale));
                context.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
                let found = false;
                if (native) {
                    let deadline: ReturnType<typeof setTimeout> | undefined;
                    try {
                        const result = await Promise.race([native.detect(canvas), new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("NATIVE_TIMEOUT")), 500); })]);
                        if (stopped)
                            return;
                        if (!options.paused()) {
                            const accepted = result.find(row => cameraFormats(options.includeQr).includes(row.format));
                            if (accepted) {
                                found = true;
                                options.onResult(accepted.rawValue);
                            }
                        }
                    }
                    catch {
                        native = null;
                    }
                    finally {
                        clearTimeout(deadline);
                    }
                }
                if (!found && worker && !pending && !options.paused() && (!native || performance.now() - lastFallback > 450)) {
                    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
                    pending = true;
                    pendingGeneration = pausedGeneration;
                    lastFallback = performance.now();
                    sequence++;
                    worker.postMessage({ buffer: pixels.data.buffer, width: canvas.width, height: canvas.height, includeQr: options.includeQr, sequence }, [pixels.data.buffer]);
                }
            }
            if (!stopped)
                timer = setTimeout(tick, native ? 50 : 70);
        };
        tick();
        return { stop };
    }
    catch (error) {
        stop();
        throw error;
    }
}
