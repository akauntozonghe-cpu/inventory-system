"use client";

import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Props = {
  onDetected: (code: string) => Promise<void> | void;
};

export default function BarcodeScanner({
  onDetected,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<any>(null);
  const readingRef = useRef(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    let stopped = false;

    async function start() {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();

        if (!devices.length) {
          alert("カメラが見つかりません。");
          return;
        }

        // 背面カメラ優先
        const device =
          devices.find((d) =>
            d.label.toLowerCase().includes("back")
          ) ?? devices[0];

        controlsRef.current =
        await reader.decodeFromVideoDevice(
          device.deviceId,
          videoRef.current!,
          async (result) => {
            if (stopped) return;
            if (!result) return;
            if (readingRef.current) return;

            readingRef.current = true;

            navigator.vibrate?.(100);

            try {
              await onDetected(result.getText());
            } finally {
              setTimeout(() => {
                readingRef.current = false;
              }, 500);
            }
          }
        );
      } catch (err) {
        console.error(err);
      }
    }

    start();

    return () => {
      stopped = true;

      controlsRef.current?.stop();
    };
  }, [onDetected]);

  return (
    <div className="rounded-xl border bg-white p-4 shadow">
      <h2 className="mb-3 text-lg font-bold">
        📷 バーコードを読み取る
      </h2>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full rounded-lg"
      />
    </div>
  );
}