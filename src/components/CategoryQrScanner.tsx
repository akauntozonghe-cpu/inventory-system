"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

type CategoryQrScannerProps = {
  currentCategory: string | null;
  onDetected: (category: string) => void;
  onClose: () => void;
};

const PREFIX = "INVENTORY_OS:CATEGORY:MAJOR:";

function parseCategoryQr(value: string) {
  if (!value.startsWith(PREFIX)) {
    return null;
  }

  try {
    const category = decodeURIComponent(
      value.slice(PREFIX.length)
    ).trim();

    return category || null;
  } catch {
    return null;
  }
}

function getCameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "カメラの使用が許可されていません。ブラウザのカメラ許可を確認してください。";
    }

    if (error.name === "NotFoundError") {
      return "利用できるカメラが見つかりませんでした。";
    }

    if (error.name === "NotReadableError") {
      return "カメラがほかのアプリで使用されています。ほかのカメラ利用を終了してから再試行してください。";
    }
  }

  return "カメラを開始できませんでした。カメラの使用許可を確認してください。";
}

export default function CategoryQrScanner({
  currentCategory,
  onDetected,
  onClose,
}: CategoryQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const lastValueRef = useRef("");
  const lastDetectedAtRef = useRef(0);

  const [message, setMessage] = useState(
    "大分類QRを正方形の枠に合わせてください。"
  );
  const [lastCategory, setLastCategory] =
    useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
  }, [onDetected, onClose]);

  useEffect(() => {
    let disposed = false;

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 700,
    });

    const stopCamera = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setCameraReady(false);
    };

    const startCamera = async () => {
      try {
        if (!videoRef.current || disposed) {
          return;
        }

        setMessage("背面カメラを起動しています…");

        controlsRef.current =
          await reader.decodeFromConstraints(
            {
              audio: false,
              video: {
                facingMode: {
                  ideal: "environment",
                },
                width: {
                  ideal: 1920,
                },
                height: {
                  ideal: 1080,
                },
              },
            },
            videoRef.current,
            (result) => {
              if (disposed || !result) {
                return;
              }

              const rawValue = result.getText().trim();
              const category = parseCategoryQr(rawValue);

              if (!category) {
                return;
              }

              const now = Date.now();
              const duplicate =
                rawValue === lastValueRef.current &&
                now - lastDetectedAtRef.current < 1800;

              if (duplicate) {
                return;
              }

              lastValueRef.current = rawValue;
              lastDetectedAtRef.current = now;

              navigator.vibrate?.(100);
              setLastCategory(category);
              setMessage(`「${category}」を読み取りました。`);

              onDetectedRef.current(category);
            }
          );

        if (!disposed) {
          setCameraReady(true);
          setMessage(
            "大分類QRを正方形の枠に合わせてください。"
          );
        }
      } catch (error) {
        // ZXingはカメラ停止・画面遷移時にfalseを返すことがある。
        // これは異常ではないため、利用者にエラー表示しない。
        if (disposed || error === false) {
          return;
        }

        console.error("CATEGORY_QR_CAMERA_ERROR", error);

        setCameraReady(false);
        setMessage(getCameraErrorMessage(error));
      }
    };

    void startCamera();

    return () => {
      disposed = true;
      stopCamera();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#050816] text-white">
      <div className="mx-auto min-h-[100dvh] max-w-2xl">
        <header className="border-b border-white/10 bg-gradient-to-r from-indigo-950 via-slate-950 to-cyan-950 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    cameraReady
                      ? "animate-pulse bg-emerald-400"
                      : "bg-amber-400"
                  }`}
                />

                <p className="text-xs font-black tracking-[0.18em] text-cyan-200">
                  CATEGORY QR SCANNER
                </p>
              </div>

              <h2 className="mt-2 text-2xl font-black">
                大分類を読み取る
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                QRコードを読み取ると大分類で棚卸対象を絞り込みます。
                作業が終わったら「閉じる」で棚卸画面へ戻ります。
              </p>
            </div>

            <button
              type="button"
              onClick={() => onCloseRef.current()}
              className="shrink-0 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold transition hover:bg-white/20"
            >
              閉じる
            </button>
          </div>
        </header>

        <main className="space-y-5 bg-slate-950 p-4 sm:p-6">
          <section className="relative aspect-square overflow-hidden rounded-[2rem] border border-cyan-300/30 bg-black shadow-[0_0_80px_rgba(34,211,238,0.15)]">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/35 via-transparent to-slate-950/45" />

            <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[74%] -translate-x-1/2 -translate-y-1/2">
              <span className="absolute left-0 top-0 h-12 w-12 rounded-tl-2xl border-l-4 border-t-4 border-cyan-300" />
              <span className="absolute right-0 top-0 h-12 w-12 rounded-tr-2xl border-r-4 border-t-4 border-cyan-300" />
              <span className="absolute bottom-0 left-0 h-12 w-12 rounded-bl-2xl border-b-4 border-l-4 border-cyan-300" />
              <span className="absolute bottom-0 right-0 h-12 w-12 rounded-br-2xl border-b-4 border-r-4 border-cyan-300" />

              <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,1)]" />
            </div>

            <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/15 bg-slate-950/80 px-4 py-3 text-center text-sm font-bold backdrop-blur">
              正方形の枠にQRコードを合わせてください
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white p-5 text-slate-950 shadow-xl">
            <p className="text-xs font-black tracking-wider text-indigo-600">
              読み取り状況
            </p>

            <p className="mt-2 text-lg font-black">{message}</p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-100 p-4">
                <p className="text-xs font-bold text-slate-500">
                  現在の大分類
                </p>

                <p className="mt-1 break-words text-lg font-black">
                  {currentCategory ?? "未選択"}
                </p>
              </div>

              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-bold text-emerald-700">
                  最後に読んだ分類
                </p>

                <p className="mt-1 break-words text-lg font-black text-emerald-950">
                  {lastCategory ?? "まだ読んでいません"}
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}