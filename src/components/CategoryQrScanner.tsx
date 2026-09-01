"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from "@zxing/library";
import { BrowserMultiFormatReader } from "@zxing/browser";

type CategoryQrScannerProps = {
  onDetected: (category: string) => void;
  onClose: () => void;
};

function decodeCategory(value: string) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function normalizeCategory(value: string) {
  const text = value.trim();

  if (!text) {
    return "";
  }

  const inventoryOsMatch = text.match(
    /^INVENTORY_OS:CATEGORY:MAJOR:(.+)$/i
  );

  if (inventoryOsMatch) {
    return decodeCategory(inventoryOsMatch[1]);
  }

  if (text.startsWith("CATEGORY:")) {
    return decodeCategory(text.replace(/^CATEGORY:/i, ""));
  }

  if (text.startsWith("大分類:")) {
    return decodeCategory(text.replace(/^大分類:/, ""));
  }

  try {
    const json: unknown = JSON.parse(text);

    if (
      json &&
      typeof json === "object" &&
      "majorCategory" in json &&
      typeof json.majorCategory === "string"
    ) {
      return decodeCategory(json.majorCategory);
    }

    if (
      json &&
      typeof json === "object" &&
      "category" in json &&
      typeof json.category === "string"
    ) {
      return decodeCategory(json.category);
    }
  } catch {
    // 通常の文字列QRとして扱う
  }

  return text;
}

function classificationLabelCode(value: string) {
  try {
    const json: unknown = JSON.parse(value);
    return json && typeof json === "object" && "classificationLabelCode" in json && typeof json.classificationLabelCode === "string"
      ? json.classificationLabelCode.trim()
      : "";
  } catch {
    return "";
  }
}

export default function CategoryQrScanner({
  onDetected,
  onClose,
}: CategoryQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const detectedRef = useRef(false);

  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);

  const [status, setStatus] = useState("カメラを起動しています…");
  const [error, setError] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
  }, [onDetected, onClose]);

  useEffect(() => {
    let active = true;

    const startCamera = async () => {
      try {
        const hints = new Map<DecodeHintType, BarcodeFormat[]>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 300,
          delayBetweenScanSuccess: 800,
        });

        readerRef.current = reader;

        if (!videoRef.current) {
          return;
        }

        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: {
                ideal: "environment",
              },
              width: { ideal: 1280 },
              height: { ideal: 1280 },
            },
          },
          videoRef.current,
          (result, scanError) => {
            if (!active || detectedRef.current) {
              return;
            }

            if (result) {
              const rawValue = result.getText();
              const category = normalizeCategory(rawValue);
              const labelCode = classificationLabelCode(rawValue);

              if (!category) {
                setError(
                  "大分類を判定できないQRコードです。正しい大分類QRを読み取ってください。"
                );
                return;
              }

              detectedRef.current = true;
              setStatus(labelCode ? "分類マスターと照合しています…" : `読み取りました：${category}`);

              try {
                controlsRef.current?.stop();
              } catch {
                // 停止済みなら何もしない
              }

              window.setTimeout(() => {
                if (!active) return;
                if (!labelCode) { onDetectedRef.current(category); return; }
                void fetch(`/api/classifications/resolve?labelCode=${encodeURIComponent(labelCode)}`, { cache: "no-store" })
                  .then(async (response) => {
                    const payload = await response.json().catch(() => null) as { classification?: { name?: string }; message?: string } | null;
                    const currentName = payload?.classification?.name?.trim();
                    if (!response.ok || !currentName) throw new Error(payload?.message ?? "分類ラベルを確認できませんでした。");
                    if (active) onDetectedRef.current(currentName);
                  })
                  .catch((resolveError) => { if (active) { detectedRef.current = false; setError(resolveError instanceof Error ? resolveError.message : "分類ラベルを確認できませんでした。"); } });
              }, 350);

              return;
            }

            if (
              scanError &&
              !(scanError instanceof NotFoundException) &&
              scanError.name !== "NotFoundException"
            ) {
              console.warn("CATEGORY_QR_SCAN_WARNING", scanError);
            }
          }
        );

        controlsRef.current = controls;

        if (active) {
          setStatus("大分類QRを枠内に合わせてください");
        }
      } catch (cameraError) {
        console.error("CATEGORY_QR_CAMERA_ERROR", cameraError);

        if (active) {
          setError(
            "カメラを起動できませんでした。カメラの利用を許可しているか、ほかのアプリが使用していないか確認してください。"
          );
        }
      }
    };

    void startCamera();

    return () => {
      active = false;

      try {
        controlsRef.current?.stop();
      } catch {
        // 停止済みなら何もしない
      }

      controlsRef.current = null;
      readerRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950">
      <div className="mx-auto min-h-screen max-w-3xl bg-slate-950 text-white">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-5 sm:px-7">
          <div>
            <p className="text-sm font-bold text-violet-300">大分類QR読取</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              大分類を選択
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              大分類QRを読み取ると、対象の商品だけを表示します。
            </p>
          </div>

          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="shrink-0 rounded-xl bg-slate-700 px-4 py-3 font-bold text-white transition hover:bg-slate-600"
          >
            閉じる
          </button>
        </header>

        <main className="space-y-5 p-5 sm:p-7">
          <section className="rounded-3xl bg-black p-3 shadow-2xl">
            <div className="relative aspect-square overflow-hidden rounded-2xl border-4 border-violet-400 bg-black">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />

              <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-4 border-white/90">
                <div className="absolute -left-1 -top-1 h-10 w-10 rounded-tl-xl border-l-8 border-t-8 border-violet-400" />
                <div className="absolute -right-1 -top-1 h-10 w-10 rounded-tr-xl border-r-8 border-t-8 border-violet-400" />
                <div className="absolute -bottom-1 -left-1 h-10 w-10 rounded-bl-xl border-b-8 border-l-8 border-violet-400" />
                <div className="absolute -bottom-1 -right-1 h-10 w-10 rounded-br-xl border-b-8 border-r-8 border-violet-400" />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 text-center text-slate-950 shadow-xl">
            {error ? (
              <>
                <p className="font-black text-red-600">
                  読み取りを開始できませんでした
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{error}</p>

                <button
                  type="button"
                  onClick={() => onCloseRef.current()}
                  className="mt-5 rounded-xl bg-slate-800 px-5 py-3 font-bold text-white"
                >
                  閉じる
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-violet-600">QRスキャン</p>
                <p className="mt-2 text-lg font-black">{status}</p>
                <p className="mt-3 text-sm text-slate-500">
                  読み取り後は自動で棚卸画面へ戻ります。
                </p>
              </>
            )}
          </section>

        </main>
      </div>
    </div>
  );
}
