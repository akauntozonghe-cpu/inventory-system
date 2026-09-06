"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from "@zxing/library";

type BarcodeCameraProps = {
  title?: string;
  notice?: string;
  closeOnDetect?: boolean;
  onDetected: (barcode: string) => void;
  onClose: () => void;
  children?: React.ReactNode;
};

export default function BarcodeCamera({
  title = "バーコードを読み取る",
  notice,
  closeOnDetect = true,
  onDetected,
  onClose,
  children,
}: BarcodeCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const detectedAtRef = useRef(0);
  const stoppedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [status, setStatus] = useState("カメラを起動しています…");
  const [lastBarcode, setLastBarcode] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanConfirmed, setScanConfirmed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    setSoundEnabled(localStorage.getItem("barcode-sound-enabled") !== "off");
  }, []);

  const playTone = () => {
    const context = audioContextRef.current;
    if (!soundEnabled || !context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.13);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.14);
  };

  const enableSound = async () => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    await context.resume();
    localStorage.setItem("barcode-sound-enabled", "on");
    setSoundEnabled(true);
    window.setTimeout(playTone, 0);
  };

  const toggleSound = async () => {
    if (soundEnabled) {
      localStorage.setItem("barcode-sound-enabled", "off");
      setSoundEnabled(false);
      return;
    }
    await enableSound();
  };

  const confirmScan = () => {
    setScanConfirmed(true);
    window.setTimeout(() => setScanConfirmed(false), 850);
    if ("vibrate" in navigator) navigator.vibrate([90, 45, 90]);
    try { playTone(); } catch { /* 視覚表示と振動は継続する。 */ }
  };

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

        const hints = new Map<DecodeHintType, BarcodeFormat[]>();
        hints.set(DecodeHintType.TRY_HARDER, true as never);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
          BarcodeFormat.QR_CODE,
        ]);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 60,
          delayBetweenScanSuccess: 500,
        });

        readerRef.current = reader;

        if (!videoRef.current) {
          return;
        }

        const videoConstraints: MediaTrackConstraints = {
          facingMode: { ideal: "environment" },
          width: { ideal: 2560, min: 1280 },
          height: { ideal: 1440, min: 720 },
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

            if (now - detectedAtRef.current < 900) {
              return;
            }

            detectedAtRef.current = now;
            setLastBarcode(barcode);
            setStatus(`読み取りました：${barcode}`);
            confirmScan();

            if (closeOnDetect) {
              stopCamera();

              window.setTimeout(() => {
                if (mounted) {
                  onDetectedRef.current(barcode);
                }
              }, 250);

              return;
            }

            onDetectedRef.current(barcode);
          }
        );

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
          if (capabilities?.zoom && capabilities.zoom.max > capabilities.zoom.min) advanced.push({ zoom: Math.min(capabilities.zoom.max, Math.max(capabilities.zoom.min, 1.5)) } as MediaTrackConstraintSet);
          if (advanced.length > 0) await track.applyConstraints({ advanced });
        }

        if (mounted) {
          setStatus(
            closeOnDetect
              ? "バーコードを枠内に合わせてください"
              : "連続スキャン中"
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
      if (audioContextRef.current) void audioContextRef.current.close();
    };
  }, [closeOnDetect]);

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
      {scanConfirmed && <div className="pointer-events-none fixed inset-0 z-[140] grid place-items-center border-[10px] border-emerald-400 bg-emerald-400/25" role="status" aria-live="assertive"><div className="rounded-3xl bg-emerald-500 px-8 py-6 text-center text-white shadow-2xl"><p className="text-4xl font-black">✓ 読取完了</p><p className="mt-2 max-w-xs break-all text-lg font-bold">{lastBarcode}</p></div></div>}
      <div className="mx-auto min-h-screen max-w-4xl bg-slate-950 text-white">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-5 sm:px-7">
          <div>
            <p className="text-sm font-bold text-indigo-300">
              {closeOnDetect ? "バーコード読取" : "連続スキャン"}
            </p>

            <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>

            {notice && (
              <p className="mt-2 text-sm text-slate-300">{notice}</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-xl bg-slate-700 px-4 py-3 font-bold text-white transition hover:bg-slate-600"
          >
            閉じる
          </button>
        </header>

        <main className="space-y-5 p-5 sm:p-7">
          <div className="sticky top-2 z-30 flex justify-end">
            <button type="button" onClick={() => void toggleSound()} className={`rounded-full px-4 py-2 text-sm font-black shadow-lg ${soundEnabled ? "bg-emerald-500 text-white" : "bg-white text-slate-900"}`}>
              {soundEnabled ? "読取音 ON（OFFにする）" : "読取音 OFF（ONにする）"}
            </button>
          </div>
          <section className="rounded-3xl bg-black p-3 shadow-2xl">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border-4 border-indigo-400 bg-black sm:aspect-video">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />

              <div className="pointer-events-none absolute inset-x-[7%] inset-y-[28%] rounded-2xl border-4 border-white/90">
                <div className="absolute -left-1 -top-1 h-9 w-9 rounded-tl-xl border-l-8 border-t-8 border-indigo-400" />
                <div className="absolute -right-1 -top-1 h-9 w-9 rounded-tr-xl border-r-8 border-t-8 border-indigo-400" />
                <div className="absolute -bottom-1 -left-1 h-9 w-9 rounded-bl-xl border-b-8 border-l-8 border-indigo-400" />
                <div className="absolute -bottom-1 -right-1 h-9 w-9 rounded-br-xl border-b-8 border-r-8 border-indigo-400" />
              </div>
            </div>
          </section>

          <section className={`rounded-3xl p-5 text-center text-slate-950 shadow-xl transition-colors ${scanConfirmed ? "bg-emerald-100 ring-4 ring-emerald-400" : "bg-white"}`}>
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
                  {closeOnDetect ? "読み取り待機中" : "連続スキャン中"}
                </p>

                <p className="mt-2 text-lg font-black">{status}</p>

                {!closeOnDetect && (
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
          </section>

          {children}
        </main>
      </div>
    </div>
  );
}
