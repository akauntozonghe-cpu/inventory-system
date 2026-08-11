"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type Props = {
  onDetected: (barcode: string) => void;
  onClose: () => void;
  children?: ReactNode;
  closeOnDetect?: boolean;
  notice?: string;
};

type CameraDevice = {
  deviceId: string;
  label: string;
};

function findPreferredCamera(devices: CameraDevice[]) {
  return (
    devices.find((device) =>
      /(back|rear|environment|背面)/i.test(device.label)
    ) ??
    devices[devices.length - 1] ??
    devices[0]
  );
}

export default function BarcodeCamera({
  onDetected,
  onClose,
  children,
  closeOnDetect = false,
  notice = "",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);

  const lastValueRef = useRef("");
  const lastDetectedAtRef = useRef(0);
  const closedAfterDetectionRef = useRef(false);

  const [cameraMessage, setCameraMessage] = useState(
    "バーコードを横長の枠内に入れてください。"
  );

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
  }, [onDetected, onClose]);

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

        // JAN/EAN、一般的な業務用バーコード、物流用ITFを対象にする。
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODABAR,
          BarcodeFormat.ITF,
        ]);

        // 読み取り精度を優先する。
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 220,
          delayBetweenScanSuccess: 900,
        });

        const devices =
          await BrowserMultiFormatReader.listVideoInputDevices();

        if (!videoRef.current || stopped) {
          return;
        }

        const preferredCamera = findPreferredCamera(devices);

        controls = await reader.decodeFromConstraints(
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
              now - lastDetectedAtRef.current < 2500;

            if (isDuplicate) {
              return;
            }

            lastValueRef.current = value;
            lastDetectedAtRef.current = now;

            navigator.vibrate?.(100);
            setCameraMessage(`読み取りました：${value}`);
            onDetectedRef.current(value);

            if (closeOnDetect && !closedAfterDetectionRef.current) {
              closedAfterDetectionRef.current = true;
              stopped = true;
              controls?.stop();

              window.setTimeout(() => {
                onCloseRef.current();
              }, 250);
            }
          }
        );
      } catch (error) {
        console.error("BARCODE_CAMERA_ERROR", error);

        if (!stopped) {
          setCameraMessage(
            "カメラを開始できませんでした。カメラの使用許可を確認してください。"
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

  const visibleNotice = notice || cameraMessage;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white">
      <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col">
        <header className="flex items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-blue-300">
              BARCODE SCAN
            </p>

            <h2 className="mt-1 text-xl font-black">
              {closeOnDetect ? "バーコードを読み取る" : "連続スキャン中"}
            </h2>

            <p className="mt-1 text-sm text-slate-300">
              {closeOnDetect
                ? "読み取ると自動でカメラを閉じます。"
                : "保存後は、そのまま次の商品を読み取れます。"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="shrink-0 rounded-xl bg-white/15 px-4 py-3 text-sm font-bold"
          >
            閉じる
          </button>
        </header>

        <section className="relative h-[34dvh] shrink-0 overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />

          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-2xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />

          <p className="absolute inset-x-4 bottom-4 rounded-2xl bg-slate-950/85 px-4 py-3 text-center text-sm font-bold">
            {visibleNotice}
          </p>
        </section>

        {!closeOnDetect && (
          <section className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4 text-slate-900">
            {children}
          </section>
        )}
      </div>
    </div>
  );
}