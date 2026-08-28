"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Props = {
  onDetected: (barcode: string) => void;
};

export default function BarcodeScanner({
  onDetected,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const readerRef =
    useRef<BrowserMultiFormatReader | null>(null);

  const controlsRef = useRef<{
    stop: () => void;
  } | null>(null);

  const [running, setRunning] =
    useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  async function startScanner() {
    try {
      const reader =
        new BrowserMultiFormatReader();

      readerRef.current = reader;

      const devices =
        await BrowserMultiFormatReader.listVideoInputDevices();

      if (devices.length === 0) {
        setErrorMessage("カメラが見つかりません。端末の接続と権限を確認してください。");
        return;
      }

      if (!videoRef.current) {
        return;
      }

      controlsRef.current =
        await reader.decodeFromVideoDevice(
          devices[0].deviceId,
          videoRef.current,
          (result) => {
            if (!result) return;

            onDetected(result.getText());

            stopScanner();
          }
        );

      setRunning(true);
    } catch (error) {
      console.error(error);

      setErrorMessage("カメラを起動できませんでした。ブラウザのカメラ権限を確認してください。");
    }
  }

  function stopScanner() {
    try {
      controlsRef.current?.stop();
    } catch (error) {
      console.error(error);
    }

    controlsRef.current = null;

    const video = videoRef.current;

    if (video?.srcObject) {
      const stream =
        video.srcObject as MediaStream;

      stream
        .getTracks()
        .forEach((track) => track.stop());

      video.srcObject = null;
    }

    readerRef.current = null;

    setRunning(false);
  }

  return (
    <div className="space-y-4">

      <video
        ref={videoRef}
        className="aspect-video w-full rounded-lg border bg-black"
        autoPlay
        playsInline
        muted
      />

      <div className="flex gap-3">

        {!running ? (
          <button
            onClick={startScanner}
            className="flex-1 rounded-lg bg-green-600 py-3 font-bold text-white transition hover:bg-green-700"
          >
            📷 カメラ開始
          </button>
        ) : (
          <button
            onClick={stopScanner}
            className="flex-1 rounded-lg bg-red-600 py-3 font-bold text-white transition hover:bg-red-700"
          >
            ⏹ 停止
          </button>
        )}

      </div>

      {errorMessage && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-900">
          {errorMessage}
        </p>
      )}

    </div>
  );
}
