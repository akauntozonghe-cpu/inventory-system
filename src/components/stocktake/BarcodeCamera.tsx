"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type Props = {
  onDetected: (value: string) => void;
  onClose: () => void;
  children?: ReactNode;
};

export default function BarcodeCamera({ onDetected, onClose, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const lastScanRef = useRef({ value: "", detectedAt: 0 });
  const [message, setMessage] = useState("バーコード・QRコードを枠に入れてください");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | undefined;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A, BarcodeFormat.CODE_128,
          BarcodeFormat.QR_CODE,
        ]);
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 150,
          delayBetweenScanSuccess: 500,
        });
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const rear = devices.find((device) => /back|rear|environment/i.test(device.label));
        if (!videoRef.current) return;
        controls = await reader.decodeFromVideoDevice(rear?.deviceId, videoRef.current, (result) => {
          if (!result || stopped) return;
          const value = result.getText().trim();
          const now = Date.now();
          if (!value || (lastScanRef.current.value === value && now - lastScanRef.current.detectedAt < 1500)) return;
          lastScanRef.current = { value, detectedAt: now };
          setMessage("読み取り: " + value);
          navigator.vibrate?.(80);
          onDetectedRef.current(value);
        });
      } catch (error) {
        console.error(error);
        setMessage("カメラを開始できませんでした。権限を許可して再試行してください。");
      }
    }
    start();
    return () => { stopped = true; controls?.stop(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 sm:items-center sm:justify-center">
      <section className="flex max-h-[100dvh] w-full max-w-xl flex-col rounded-t-3xl bg-slate-950 p-4 text-white sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">カメラで連続読取</h2>
          <button onClick={onClose} className="rounded-lg bg-white/15 px-4 py-2">閉じる</button>
        </div>
        <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full rounded-2xl bg-black object-cover" />
        <p className="mt-3 text-sm text-slate-300">{message}</p>
        <p className="mt-1 text-xs text-slate-400">読み取り後もカメラは閉じません。終了するまで「閉じる」を押してください。</p>
        {children && <div className="mt-3 min-h-0 overflow-y-auto rounded-2xl bg-slate-100 p-3 text-slate-900">{children}</div>}
      </section>
    </div>
  );
}
