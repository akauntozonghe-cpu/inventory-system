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

  const [status, setStatus] = useState("カメラを起動しています…");
  const [lastBarcode, setLastBarcode] = useState("");
  const [cameraError, setCameraError] = useState("");

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
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 700,
        });

        readerRef.current = reader;

        if (!videoRef.current) {
          return;
        }

        const videoConstraints: MediaTrackConstraints = {
          facingMode: { ideal: "environment" },
          width: { ideal: 2560, min: 1280 },
          height: { ideal: 1440, min: 720 },
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
          };
          if (capabilities?.focusMode?.includes("continuous")) {
            await track.applyConstraints({
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            });
          }
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

          <section className="rounded-3xl bg-white p-5 text-center text-slate-950 shadow-xl">
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
