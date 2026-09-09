"use client";
import { scanDisplayText } from "@/lib/scan-payload";
import { playScanBeep, primeScanAudio, scanSoundEnabled, setScanSoundEnabled } from "@/lib/scan-feedback";

import { useEffect, useRef, useState } from "react";
import { createProductReader, createScanGate } from "@/lib/scan-reader";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  NotFoundException,
} from "@zxing/library";

type BarcodeCameraProps = {
  title?: string;
  includeQr?: boolean;
  continuous?: boolean;
  pauseMessage?: string;
  notice?: string;
  closeOnDetect?: boolean;
  paused?: boolean;
  onDetected: (barcode: string) => void;
  onClose: () => void;
  children?: React.ReactNode;
};

export default function BarcodeCamera({
  title = "JAN・QRを読み取る",
  includeQr = true,
  continuous = false,
  pauseMessage = "数量入力中です。保存すると読取を再開します。",
  notice,
  closeOnDetect = true,
  paused = false,
  onDetected,
  onClose,
  children,
}: BarcodeCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanGateRef = useRef(createScanGate());
  const stoppedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const pausedRef = useRef(paused);

  const [status, setStatus] = useState("カメラを起動しています…");
  const [lastBarcode, setLastBarcode] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanConfirmed, setScanConfirmed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showFullFrame, setShowFullFrame] = useState(false);

  useEffect(() => { setSoundEnabled(scanSoundEnabled()); primeScanAudio(); }, []);
  const toggleSound = async () => {
    const next = !scanSoundEnabled();
    setScanSoundEnabled(next); setSoundEnabled(next);
    if (next) primeScanAudio();
  };

  const confirmScan = (barcode: string) => {
    setScanConfirmed(true);
    window.setTimeout(() => setScanConfirmed(false), 850);
    if ("vibrate" in navigator) navigator.vibrate([90, 45, 90]);
    try { playScanBeep(barcode); } catch { /* 視覚表示と振動は継続する。 */ }
  };

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
  }, [onDetected, onClose]);

  useEffect(() => {
    let mounted = true;

    const stopCamera = () => {
      if (stoppedRef.current) {
        return;
      }

      stoppedRef.current = true;

      try {
        controlsRef.current?.stop();
      } catch {
        // 停止済みの場合は何もしない
      }

      controlsRef.current = null;
      readerRef.current = null;
    };

    const startCamera = async () => {
      try {
        stoppedRef.current = false;

        const reader = createProductReader(includeQr);

        readerRef.current = reader;

        if (!videoRef.current) {
          return;
        }

        const videoConstraints: MediaTrackConstraints = {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16 / 9 },
        };

        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: videoConstraints,
          },
          videoRef.current,
          (result, scanError) => {
            if (!mounted || stoppedRef.current) {
              return;
            }

            if (!result) {
              if (
                scanError &&
                !(scanError instanceof NotFoundException) &&
                scanError.name !== "NotFoundException"
              ) {
                console.warn("BARCODE_SCAN_WARNING", scanError);
              }

              return;
            }

            const barcode = result.getText().trim();

            if (!barcode) {
              return;
            }

            const now = Date.now();

            if (!scanGateRef.current(barcode, now, pausedRef.current)) return;

            setLastBarcode(scanDisplayText(barcode));
            setStatus(scanDisplayText(barcode));
            confirmScan(barcode);

            if (closeOnDetect) {
              stopCamera();

              onDetectedRef.current(barcode);

              return;
            }

            onDetectedRef.current(barcode);
          }
        );

        if (!mounted || stoppedRef.current) { controls.stop(); return; }
        window.dispatchEvent(new Event("inventory:camera-granted"));
        controlsRef.current = controls;

        // 同じ読取エンジン・解像度・連続AFを単品/連続の両方で使う。
        // focusMode は一部端末のみ対応するため capability を確認して適用する。
        const track = videoRef.current.srcObject instanceof MediaStream
          ? videoRef.current.srcObject.getVideoTracks()[0]
          : undefined;
        if (track) {
          const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
            focusMode?: string[];
            exposureMode?: string[];
            zoom?: { min: number; max: number; step?: number };
          };
          const advanced: MediaTrackConstraintSet[] = [];
          if (capabilities?.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
          if (capabilities?.exposureMode?.includes("continuous")) advanced.push({ exposureMode: "continuous" } as MediaTrackConstraintSet);
          if (advanced.length > 0) { try { await track.applyConstraints({ advanced }); } catch { /* Keep the usable stream when optional camera tuning is unsupported. */ } }
        }

        if (mounted) {
          setStatus(
            includeQr ? "JAN・QR全体を枠内に合わせてください" : "JANを横長の枠に合わせてください"
          );
        }
      } catch (error) {
        console.error("BARCODE_CAMERA_ERROR", error);

        if (mounted) {
          setCameraError(
            "カメラを起動できませんでした。カメラの利用を許可し、ほかのアプリがカメラを使用していないか確認してください。"
          );
        }
      }
    };

    void startCamera();

    return () => {
      mounted = false;
      stopCamera();

    };
  }, [closeOnDetect, includeQr]);

  const handleClose = () => {
    try {
      controlsRef.current?.stop();
    } catch {
      // 停止済みの場合は何もしない
    }

    onCloseRef.current();
  };

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950">
      {scanConfirmed && !continuous && <div className="pointer-events-none fixed inset-0 z-[140] grid place-items-center border-[10px] border-emerald-400 bg-emerald-400/25" role="status" aria-live="assertive"><div className="rounded-3xl bg-emerald-500 px-8 py-6 text-center text-white shadow-2xl"><p className="text-4xl font-black">✓ 読取完了</p><p className="mt-2 max-w-xs break-all text-lg font-bold">{lastBarcode}</p></div></div>}
      <div className="mx-auto min-h-screen max-w-4xl bg-slate-950 text-white">
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-3 py-3 sm:px-7">
          <div>
            <p className="text-sm font-bold text-indigo-300">
              {continuous ? "商品を続けて数える" : includeQr ? "JAN・QR読取" : "商品バーコード読取"}
            </p>

            <h1 className="mt-1 text-xl font-black sm:text-3xl">{title}</h1>

            {notice && (
              <p className="mt-2 text-sm text-slate-300">{notice}</p>
            )}
            {paused && <p role="status" className="mt-2 font-bold text-amber-200">{pauseMessage}</p>}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-xl bg-slate-700 px-4 py-3 font-bold text-white transition hover:bg-slate-600"
          >
            閉じる
          </button>
        </header>

        <main className="space-y-3 px-1 py-2 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2">
            <button type="button" aria-pressed={showFullFrame} onClick={() => setShowFullFrame(value => !value)} className="min-h-11 rounded-xl bg-slate-700 px-3 py-2 text-sm font-bold text-white">
              {showFullFrame ? "大きく表示する" : "映像全体を表示する"}
            </button>
            <button type="button" onClick={() => void toggleSound()} className={`min-h-11 rounded-xl px-3 py-2 text-sm font-black shadow-lg ${soundEnabled ? "bg-emerald-500 text-white" : "bg-white text-slate-900"}`}>
              {soundEnabled ? "読取音 ON" : "読取音 OFF"}
            </button>
          </div>
          <section className="rounded-xl bg-black shadow-2xl">
            <div className={`relative ${continuous ? "h-[32dvh] min-h-44 max-h-80" : "h-[60dvh] min-h-64 max-h-[720px]"} overflow-hidden rounded-xl border-2 border-indigo-400 bg-black`}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`h-full w-full ${showFullFrame ? "object-contain" : "object-cover"}`}
              />

              <div className={`pointer-events-none absolute ${continuous ? "inset-x-[7%] inset-y-[30%]" : "inset-[7%]"} rounded-2xl border-4 border-white/90`}>
                <div className="absolute -left-1 -top-1 h-9 w-9 rounded-tl-xl border-l-8 border-t-8 border-indigo-400" />
                <div className="absolute -right-1 -top-1 h-9 w-9 rounded-tr-xl border-r-8 border-t-8 border-indigo-400" />
                <div className="absolute -bottom-1 -left-1 h-9 w-9 rounded-bl-xl border-b-8 border-l-8 border-indigo-400" />
                <div className="absolute -bottom-1 -right-1 h-9 w-9 rounded-br-xl border-b-8 border-r-8 border-indigo-400" />
              </div>
            </div>
          </section>

          {(!continuous || cameraError) && <section className={`rounded-3xl p-5 text-center text-slate-950 shadow-xl transition-colors ${scanConfirmed ? "bg-emerald-100 ring-4 ring-emerald-400" : "bg-white"}`}>
            {cameraError ? (
              <>
                <p className="font-black text-red-600">
                  カメラを起動できませんでした
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {cameraError}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-indigo-600">
                  {continuous ? "連続スキャン中" : "読み取り待機中"}
                </p>

                <p className="mt-2 text-lg font-black">{status}</p>

                {continuous && (
                  <p className="mt-3 text-sm text-slate-500">
                    数量を保存後、そのまま次の商品を読み取れます。
                  </p>
                )}

                {lastBarcode && (
                  <p className="mt-3 break-all text-sm text-slate-500">
                    最終読取：{lastBarcode}
                  </p>
                )}
              </>
            )}
          </section>}
          {continuous && scanConfirmed && <p role="status" className="px-3 text-lg font-bold text-emerald-300">✓ {lastBarcode}</p>}

          {children}
        </main>
      </div>
    </div>
  );
}
