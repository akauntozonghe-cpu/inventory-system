"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type Props = {
  onDetected: (barcode: string) => void;
  onClose: () => void;
  children?: ReactNode;
};

export default function BarcodeCamera({
  onDetected,
  onClose,
  children,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const lastValueRef = useRef("");
  const lastDetectedAtRef = useRef(0);

  const [message, setMessage] = useState(
    "バーコードを枠に入れてください"
  );

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | undefined;

    const start = async () => {
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
          delayBetweenScanAttempts: 150,
        });

        if (!videoRef.current) return;

        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (!result || stopped) return;

            const value = result.getText();
            const now = Date.now();

            if (
              lastValueRef.current === value &&
              now - lastDetectedAtRef.current < 1200
            ) {
              return;
            }

            lastValueRef.current = value;
            lastDetectedAtRef.current = now;

            navigator.vibrate?.(80);
            setMessage(`読み取りました：${value}`);
            onDetectedRef.current(value);
          }
        );
      } catch (error) {
        console.error(error);
        setMessage(
          "カメラを開始できませんでした。権限を確認してください。"
        );
      }
    };

    start();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      <div className="relative mx-auto flex h-full max-w-2xl flex-col">
        <header className="flex items-center justify-between p-4">
          <div>
            <h2 className="font-bold">連続スキャン中</h2>
            <p className="text-xs text-slate-300">
              読み取ってもカメラは閉じません
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/15 px-4 py-2 font-bold"
          >
            スキャン終了
          </button>
        </header>

        <div className="relative flex-1 overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />

          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-44 -translate-y-1/2 rounded-2xl border-4 border-white/80" />

          <p className="absolute inset-x-4 top-4 rounded-xl bg-black/60 p-3 text-center text-sm">
            {message}
          </p>
        </div>

        {children && (
          <div className="absolute inset-x-3 bottom-3 z-10">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}