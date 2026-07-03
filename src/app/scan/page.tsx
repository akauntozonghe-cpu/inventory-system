"use client";

import {
  BrowserMultiFormatReader,
} from "@zxing/browser";

import {
  useEffect,
  useRef,
  useState,
} from "react";

type Inventory = {
  id: string;
  quantity: number;
  actualQuantity?: number | null;

  managementCode?: string | null;

  item: {
    name: string;
    janCode?: string | null;
  };
};

export default function ScanPage() {
  const [inventory, setInventory] =
    useState<Inventory[]>([]);

  const [search, setSearch] =
    useState("");

  const [item, setItem] =
    useState<Inventory | null>(null);

  const [message, setMessage] =
    useState("");

  const [actualQuantity,
    setActualQuantity] =
    useState("");

  const [scannerOpen,
    setScannerOpen] =
    useState(false);

  const [devices,
    setDevices] =
    useState<MediaDeviceInfo[]>([]);

  const [selectedDeviceId,
    setSelectedDeviceId] =
    useState("");

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const readerRef =
    useRef<BrowserMultiFormatReader | null>(
      null
    );

  useEffect(() => {
    fetchInventory();
    loadCameras();
  }, []);

  const fetchInventory =
    async () => {
      try {
        const res =
          await fetch(
            "/api/inventory",
            {
              cache:
                "no-store",
            }
          );

        const data =
          await res.json();

        if (
          Array.isArray(data)
        ) {
          setInventory(data);
        }
      } catch (
        error
      ) {
        console.error(
          error
        );

        setMessage(
          "在庫取得失敗"
        );
      }
    };

  const loadCameras =
    async () => {
      try {
        const devices =
          await navigator.mediaDevices.enumerateDevices();

        const videoDevices =
          devices.filter(
            (d) =>
              d.kind ===
              "videoinput"
          );

        setDevices(
          videoDevices
        );

        const backCamera =
          videoDevices.find(
            (d) =>
              d.label
                .toLowerCase()
                .includes(
                  "back"
                )
          );

        setSelectedDeviceId(
          backCamera?.deviceId ||
          videoDevices[0]
            ?.deviceId ||
          ""
        );
      } catch (
        error
      ) {
        console.error(
          error
        );
      }
    };

  const searchItem = (
  code?: string
) => {
  const target =
    String(
      code ?? search
    ).trim();

  const found =
    inventory.find(
      (i) =>
        i.item?.janCode === target ||
        i.managementCode === target
    );

  if (!found) {
    setItem(null);
    setMessage(
      "商品が見つかりません"
    );
    return;
  }

  navigator.vibrate?.(100);

  setItem(found);

  // 一旦消す
  // setActualQuantity(
  //   String(
  //     found.actualQuantity ??
  //     found.quantity
  //   )
  // );

  setSearch("");
  setMessage("");
};

  const saveStocktake =
    async () => {
      if (!item) {
        return;
      }

      try {
        const res =
          await fetch(
            "/api/inventory",
            {
              method:
                "PATCH",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  {
                    id:
                      item.id,

                    actualQuantity:
                      Number(
                        actualQuantity
                      ),
                  }
                ),
            }
          );

        if (!res.ok) {
          throw new Error(
            "保存失敗"
          );
        }

        setMessage(
          "棚卸保存完了"
        );

        setItem(null);

        setSearch("");

        setActualQuantity("");

        await stopScanner();

        setScannerOpen(false);
      } catch (
        error
      ) {
        console.error(
          error
        );

        setMessage(
          "保存失敗"
        );
      }
    };
  
const stopScanner =
    async () => {
      try {
        if (
          videoRef.current
        ) {
          const stream =
            videoRef.current
              .srcObject as MediaStream;

          stream
            ?.getTracks()
            .forEach(
              (track) =>
                track.stop()
            );

          videoRef.current.srcObject =
            null;
        }
      } catch {}

      readerRef.current =
        null;
    };

  useEffect(() => {
    if (
      !scannerOpen ||
      !selectedDeviceId
    ) {
      return;
    }

    const start =
      async () => {
        try {
          const reader =
            new BrowserMultiFormatReader();

          readerRef.current =
            reader;

          await reader.decodeFromVideoDevice(
            selectedDeviceId,
            videoRef.current!,
            async (
              result
            ) => {
              if (
                !result
              ) {
                return;
              }

              searchItem(
                result.getText()
              );

              await stopScanner();

              setScannerOpen(
                false
              );
            }
          );
        } catch (
          error
        ) {
          console.error(
            error
          );

          setMessage(
            "カメラ起動失敗"
          );
        }
      };

    start();

    return () => {
      stopScanner();
    };
  }, [
    scannerOpen,
    selectedDeviceId,
  ]);

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-3xl font-bold mb-4">
        棚卸
      </h1>

      {message && (
        <div className="bg-red-500 text-white p-3 rounded mb-4">
          {message}
        </div>
      )}

      <input
        value={
          search
        }
        onChange={(
          e
        ) =>
          setSearch(
            e.target
              .value
          )
        }
        onKeyDown={(
          e
        ) => {
          if (
            e.key ===
            "Enter"
          ) {
            searchItem();
          }
        }}
        placeholder="JANコード / 管理番号"
        className="border p-3 rounded w-full"
      />

      <button
        onClick={() =>
          searchItem()
        }
        className="w-full bg-blue-600 text-white p-3 rounded mt-3"
      >
        検索
      </button>

      {devices.length >
        0 && (
        <select
          value={
            selectedDeviceId
          }
          onChange={(
            e
          ) =>
            setSelectedDeviceId(
              e.target
                .value
            )
          }
          className="border p-3 rounded w-full mt-3"
        >
          {devices.map(
            (
              d
            ) => (
              <option
                key={
                  d.deviceId
                }
                value={
                  d.deviceId
                }
              >
                {d.label ||
                  "Camera"}
              </option>
            )
          )}
        </select>
      )}

      <button
        onClick={async () => {
          await stopScanner();

          setScannerOpen(
            true
          );
        }}
        className="w-full bg-black text-white p-3 rounded mt-3"
      >
        カメラ読取
      </button>

      {scannerOpen && (
        <video
          ref={
            videoRef
          }
          className="w-full mt-4 rounded border"
          muted
          playsInline
        />
      )}

      {item && (
        <div className="bg-white shadow rounded p-4 mt-4">
          <div className="text-2xl font-bold">
            {
              item.item
                .name
            }
          </div>

          <div className="mt-2">
            JAN:
            {
              item.item
                .janCode
            }
          </div>

          <div className="mt-2">
            管理番号:
            {
              item.managementCode
            }
          </div>

          <div className="mt-4">
            理論在庫:
            {
              item.quantity
            }
          </div>

          <div className="mt-4">
            <label>
              実在庫
            </label>

            <input
              type="number"
              value={
                actualQuantity
              }
              onChange={(
                e
              ) =>
                setActualQuantity(
                  e.target
                    .value
                )
              }
              className="border p-2 rounded w-full"
            />
          </div>

          <div className="mt-4 font-bold">
            差異:
            {
              Number(
                actualQuantity
              ) -
              item.quantity
            }
          </div>

          <button
            onClick={
              saveStocktake
            }
            className="w-full bg-green-600 text-white p-3 rounded mt-4"
          >
            棚卸保存
          </button>
        </div>
      )}
    </div>
  );
}
