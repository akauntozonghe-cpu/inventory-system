"use client";

import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Props = {
  onDetected: (barcode: string) => void;
};

export default function BarcodeScanner({
  onDetected,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastCodeRef = useRef("");
  const lastReadTimeRef = useRef(0);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    let cancelled = false;

    async function startScanner() {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();

        if (devices.length === 0) {
          alert("カメラが見つかりません。");
          return;
        }

        const deviceId = devices[0].deviceId;

        if (!videoRef.current) return;

        await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result, error) => {            if (result && !cancelled) {
              const text = result.getText();

const now = Date.now();

if (
  lastCodeRef.current === text &&
  now - lastReadTimeRef.current < 1000
) {
  return;
}

lastCodeRef.current = text;
lastReadTimeRef.current = now;

try {
  new Audio("/sounds/beep.mp3").play();
} catch {}

if ("vibrate" in navigator) {
  navigator.vibrate(100);
}

onDetected(text);
            }

            if (error) {
              // 読み取り待機中はエラーが頻繁に発生するため何もしない
            }
          }
        );
      } catch (err) {
        console.error(err);
        alert("カメラを起動できませんでした。");
      }
    }

    startScanner();

    return () => {
      cancelled = true;

      readerRef.current = null;
    };
  }, [onDetected]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="w-full rounded-xl border"
    />
  );
}