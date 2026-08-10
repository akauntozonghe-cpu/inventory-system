"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";

type CategoryQrScannerProps = {
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

export default function CategoryQrScanner({
  onDetected,
  onClose,
}: CategoryQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const handledRef = useRef(false);

  const [message, setMessage] = useState(
    "カメラを起動しています…"
  );

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
  }, [onDetected, onClose]);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let disposed = false;

    const stopCamera = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };

    const startCamera = async () => {
      try {
        const devices =
          await BrowserMultiFormatReader.listVideoInputDevices();

        if (disposed) {
          return;
        }

        if (devices.length === 0) {
          setMessage(
            "利用できるカメラが見つかりません。カメラの許可を確認してください。"
          );
          return;
        }

        const backCamera =
          devices.find((device) =>
            device.label.toLowerCase().includes("back")
          ) ?? devices[devices.length - 1];

        if (!videoRef.current) {
          return;
        }

        setMessage(
          "大分類QRを枠内に入れてください。読み取ると自動で閉じます。"
        );

        controlsRef.current = await reader.decodeFromVideoDevice(
          backCamera.deviceId,
          videoRef.current,
          (result) => {
            if (disposed || handledRef.current || !result) {
              return;
            }

            const category = parseCategoryQr(result.getText());

            if (!category) {
              setMessage(
                "Inventory OSで発行した大分類QRを読み取ってください。"
              );
              return;
            }

            handledRef.current = true;
            navigator.vibrate?.(100);

            stopCamera();
            onDetectedRef.current(category);
            onCloseRef.current();
          }
        );
      } catch (error) {
        console.error("CATEGORY_QR_CAMERA_ERROR", error);

        setMessage(
          "カメラを起動できませんでした。カメラの利用を許可して、もう一度試してください。"
        );
      }
    };

    void startCamera();

    return () => {
      disposed = true;
      stopCamera();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/70 sm:items-center sm:justify-center sm:p-6">
      <section className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-widest text-indigo-600">
              CATEGORY QR
            </p>

            <h2 className="mt-1 text-2xl font-black text-slate-900">
              大分類QRを読み取る
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200"
          >
            閉じる
          </button>
        </div>

        <p className="mt-4 rounded-xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800">
          {message}
        </p>

        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="mt-4 aspect-[4/3] w-full rounded-2xl bg-slate-950 object-cover"
        />

        <p className="mt-4 text-sm leading-6 text-slate-500">
          棚や保管ケースに貼った「大分類QRラベル」を読み取ると、商品一覧をその大分類だけに絞り込みます。
        </p>
      </section>
    </div>
  );
}