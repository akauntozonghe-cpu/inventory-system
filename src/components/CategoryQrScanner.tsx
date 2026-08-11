"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";

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
    const category = decodeURIComponent(value.slice(PREFIX.length)).trim();

    return category || null;
  } catch {
    return null;
  }
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
    "大分類QRをカメラに写してください。"
  );
  const [lastReadCategory, setLastReadCategory] = useState<string | null>(
    null
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
            "利用できるカメラが見つかりません。カメラの利用許可を確認してください。"
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
          "大分類QRを読み取り中です。読み取った後もカメラは開いたままです。"
        );

        controlsRef.current = await reader.decodeFromVideoDevice(
          backCamera.deviceId,
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
            const isDuplicate =
              rawValue === lastValueRef.current &&
              now - lastDetectedAtRef.current < 1800;

            if (isDuplicate) {
              return;
            }

            lastValueRef.current = rawValue;
            lastDetectedAtRef.current = now;

            navigator.vibrate?.(100);

            setLastReadCategory(category);
            setMessage(`大分類「${category}」を適用しました。`);
            onDetectedRef.current(category);
          }
        );
      } catch (error) {
        console.error("CATEGORY_QR_CAMERA_ERROR", error);

        if (!disposed) {
          setMessage(
            "カメラを起動できませんでした。カメラの利用許可を確認して、もう一度試してください。"
          );
        }
      }
    };

    void startCamera();

    return () => {
      disposed = true;
      stopCamera();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white">
      <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col">
        <header className="flex items-start justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-indigo-300">
              CATEGORY QR SCAN
            </p>
            <h2 className="mt-1 text-xl font-black">大分類QRを読み取る</h2>
            <p className="mt-1 text-sm text-slate-300">
              QR読取を終了するまで、カメラは開いたままです。
            </p>
          </div>

          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="shrink-0 rounded-xl bg-white/15 px-4 py-3 text-sm font-bold text-white"
          >
            QR読取を終了
          </button>
        </header>

        <section className="relative h-[38dvh] shrink-0 overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />

          <div className="pointer-events-none absolute inset-x-10 top-1/2 h-32 -translate-y-1/2 rounded-2xl border-4 border-white/80" />
        </section>

        <section className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4 text-slate-900">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              読み取り状況
            </p>
            <p className="mt-2 font-bold text-slate-900">{message}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-indigo-50 p-4">
                <p className="text-xs font-bold text-indigo-600">
                  現在の大分類
                </p>
                <p className="mt-1 text-lg font-black text-indigo-950">
                  {currentCategory ?? "未選択"}
                </p>
              </div>

              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-bold text-emerald-600">
                  最後に読み取ったQR
                </p>
                <p className="mt-1 text-lg font-black text-emerald-950">
                  {lastReadCategory ?? "まだ読み取っていません"}
                </p>
              </div>
            </div>

            <p className="mt-5 text-sm leading-6 text-slate-600">
              大分類を読み取ると、その分類の棚卸対象だけに切り替わります。
              別の大分類QRを読めば、続けて対象を変更できます。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}