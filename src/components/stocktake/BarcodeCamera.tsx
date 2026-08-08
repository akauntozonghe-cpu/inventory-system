"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type Props = {
  onDetected: (barcode: string) => void;
  onClose: () => void;
  children?: ReactNode;
  closeOnDetect?: boolean;
};

export default function BarcodeCamera({
  onDetected,
  onClose,
  children,
  closeOnDetect = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);

  const lastValueRef = useRef("");
  const lastDetectedAtRef = useRef(0);
  const closedAfterDetectionRef = useRef(false);

  const [message, setMessage] = useState(
    "バーコードを枠内に入れてください"
  );

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | undefined;

    const startCamera = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import(
          "@zxing/library"
        );

        const hints = new Map();

        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.CODE_128,
        ]);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 180,
        });

        if (!videoRef.current || stopped) {
          return;
        }

        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (!result || stopped) {
              return;
            }

            const value = result.getText().trim();

            if (!value) {
              return;
            }

            const now = Date.now();
            const isDuplicate =
              lastValueRef.current === value &&
              now - lastDetectedAtRef.current < 1800;

            if (isDuplicate) {
              return;
            }

            lastValueRef.current = value;
            lastDetectedAtRef.current = now;

            navigator.vibrate?.(80);

            setMessage(`読み取りました：${value}`);
            onDetectedRef.current(value);

            if (closeOnDetect && !closedAfterDetectionRef.current) {
              closedAfterDetectionRef.current = true;
              stopped = true;
              controls?.stop();

              window.setTimeout(() => {
                onCloseRef.current();
              }, 150);
            }
          }
        );
      } catch (caughtError) {
        console.error(caughtError);

        if (!stopped) {
          setMessage(
            "カメラを起動できませんでした。カメラの使用許可を確認してください。"
          );
        }
      }
    };

    void startCamera();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [closeOnDetect]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white">
      <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col">
        <header className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="font-bold">
              {closeOnDetect
                ? "カメラで読み取る"
                : "連続スキャン中"}
            </h2>

            <p className="text-xs text-slate-300">
              {closeOnDetect
                ? "読み取ると自動で閉じます"
                : "保存後、そのまま次の商品を読み取れます"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold"
          >
            閉じる
          </button>
        </header>

        <section className="relative h-[34dvh] shrink-0 overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />

          <div className="pointer-events-none absolute inset-x-10 top-1/2 h-32 -translate-y-1/2 rounded-2xl border-4 border-white/80" />

          <p className="absolute inset-x-3 top-3 rounded-xl bg-black/60 px-3 py-2 text-center text-sm">
            {message}
          </p>
        </section>

        {!closeOnDetect && (
          <section className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-3 text-slate-900">
            {children || (
              <div className="rounded-2xl bg-white p-5 text-center shadow">
                <p className="font-bold">
                  商品を読み取ってください
                </p>

                <p className="mt-2 text-sm text-slate-600">
                  読み取った商品と数量入力が、ここに表示されます。
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}