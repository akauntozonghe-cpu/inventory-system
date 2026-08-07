"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onDetected: (barcode: string) => void;
  onClose: () => void;
};

export default function BarcodeCamera({
  onDetected,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const lastBarcodeRef = useRef("");
  const lastDetectedAtRef = useRef(0);

  const [message, setMessage] = useState(
    "カメラでバーコードを読み取ります"
  );

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

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
            delayBetweenScanAttempts: 150,
        });

        const devices =
          await BrowserMultiFormatReader.listVideoInputDevices();

        const rearCamera = devices.find((device) =>
          /back|rear|environment/i.test(device.label)
        );

        if (!videoRef.current) {
          return;
        }

        controls = await reader.decodeFromVideoDevice(
          rearCamera?.deviceId,
          videoRef.current,
          (result) => {
            if (!result || stopped) {
              return;
            }

            const barcode = result.getText();
            const now = Date.now();

            // 同じコードをカメラが連続で拾うのを少しだけ抑える
            if (
              lastBarcodeRef.current === barcode &&
              now - lastDetectedAtRef.current < 1200
            ) {
              return;
            }

            lastBarcodeRef.current = barcode;
            lastDetectedAtRef.current = now;

            setMessage(`読み取りました：${barcode}`);
            navigator.vibrate?.(80);

            // 読み取ってもカメラは閉じない
            onDetectedRef.current(barcode);
          }
        );
      } catch (error) {
        console.error(error);

        setMessage(
          "カメラを開始できませんでした。ブラウザのカメラ利用を許可してから、もう一度開いてください。"
        );
      }
    };

    startCamera();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 sm:items-center sm:justify-center">
      <section className="w-full max-w-xl rounded-t-3xl bg-slate-950 p-4 text-white sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">
              カメラでバーコードを読む
            </h2>

            <p className="text-xs text-slate-300">
              読み取った後もカメラは開いたままです
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/15 px-4 py-2 font-bold hover:bg-white/25"
          >
            閉じる
          </button>
        </div>

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full rounded-2xl bg-black object-cover"
        />

        <p className="mt-3 text-sm text-slate-200">
          {message}
        </p>

        <p className="mt-1 text-xs text-slate-400">
          バーコード全体が枠に入るように、少し離してピントが合うまで待ってください。
        </p>
      </section>
    </div>
  );
}