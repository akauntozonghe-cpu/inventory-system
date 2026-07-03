"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BrowserMultiFormatReader,
} from "@zxing/browser";

type Inventory = {
  id: string;
  quantity: number;
  actualQuantity?: number | null;
  status?: string;

  managementCode?: string | null;
  expirationDate?: string | null;
  unit?: string | null;

  storageLocation?: {
    name: string;
  } | null;

  item: {
    name: string;
    janCode?: string | null;
  };
};

export default function StocktakePage() {
  const [inventory,
    setInventory] =
    useState<Inventory[]>([]);

  const [search,
    setSearch] =
    useState("");

  const [selectedItem,
    setSelectedItem] =
    useState<Inventory | null>(
      null
    );

  const [savingId,
    setSavingId] =
    useState("");

  const [message,
    setMessage] =
    useState("");

  const [recentItems,
    setRecentItems] =
    useState<Inventory[]>([]);

  const [scannerOpen,
    setScannerOpen] =
    useState(false);

  const [devices,
    setDevices] =
    useState<
      MediaDeviceInfo[]
    >([]);

  const [cameraIndex,
    setCameraIndex] =
    useState(0);

  const videoRef =
    useRef<HTMLVideoElement>(
      null
    );

  const readerRef =
    useRef<
      BrowserMultiFormatReader | null
    >(null);

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

        setInventory(data);
      } catch (
        error
      ) {
        console.error(
          error
        );
      }
    };

  useEffect(() => {
    fetchInventory();
  }, []);

  const completed =
    inventory.filter(
      (i) =>
        i.actualQuantity !==
          null &&
        i.actualQuantity !==
          undefined
    ).length;

  const pending =
    inventory.length -
    completed;

  const differenceCount =
    inventory.filter(
      (i) =>
        i.actualQuantity !==
          null &&
        i.actualQuantity !==
          undefined &&
        i.actualQuantity !==
          i.quantity
    ).length;

  const progress =
    inventory.length === 0
      ? 0
      : Math.round(
          (completed /
            inventory.length) *
            100
        );

  const displayInventory =
    useMemo(() => {
      if (
        !search.trim()
      ) {
        return inventory;
      }

      const keyword =
        search.toLowerCase();

      return inventory.filter(
        (i) =>
          i.item.name
            ?.toLowerCase()
            .includes(
              keyword
            ) ||
          i.managementCode
            ?.toLowerCase()
            .includes(
              keyword
            ) ||
          i.item.janCode
            ?.toLowerCase()
            .includes(
              keyword
            )
      );
    }, [
      inventory,
      search,
    ]);

    useEffect(() => {
    const keyword =
      search.trim();

    if (!keyword) {
      setSelectedItem(
        null
      );
      return;
    }

    const found =
      inventory.find(
        (i) =>
          i.item.name.includes(
            keyword
          ) ||
          i.managementCode ===
            keyword ||
          i.item.janCode ===
            keyword
      );

    setSelectedItem(
      found ?? null
    );
  }, [
    search,
    inventory,
  ]);

  const getDifference =
    (
      item: Inventory
    ) => {
      if (
        item.actualQuantity ===
          null ||
        item.actualQuantity ===
          undefined
      ) {
        return null;
      }

      return (
        item.actualQuantity -
        item.quantity
      );
    };

  const startScanner =
  async (
    deviceId?: string
  ) => {
    try {

      setScannerOpen(
        true
      );

      const cameraList =
        await navigator.mediaDevices.enumerateDevices();

      const videoDevices =
        cameraList.filter(
          (d) =>
            d.kind ===
            "videoinput"
        );

      setDevices(
        videoDevices
      );

      if (
        !videoRef.current
      ) {
        return;
      }

      readerRef.current =
        new BrowserMultiFormatReader();

      await readerRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result) => {

          if (!result) {
            return;
          }

          const code =
            result.getText();

          console.log(
            "BARCODE:",
            code
          );

          setSearch(
            code
          );
        }
      );

    } catch (
      error
    ) {

      console.error(
        error
      );

      alert(
        "カメラ起動失敗"
      );
    }
  };

  const stopScanner =
  () => {

    const stream =
      videoRef.current
        ?.srcObject as
        | MediaStream
        | null;

    stream
      ?.getTracks()
      .forEach(
        (
          track
        ) =>
          track.stop()
      );

    if (
      videoRef.current
    ) {
      videoRef.current.srcObject =
        null;
    }

    readerRef.current =
      null;

    setScannerOpen(
      false
    );
  };

  const changeCamera =
  async () => {

    if (
      devices.length <= 1
    ) {
      return;
    }

    const nextIndex =
      (
        cameraIndex +
        1
      ) %
      devices.length;

    setCameraIndex(
      nextIndex
    );

    stopScanner();

    setTimeout(
      () => {
        startScanner(
          devices[
            nextIndex
          ].deviceId
        );
      },
      500
    );
  };  

  const saveStocktake =
    async (
      id: string,
      actualQuantity: number
    ) => {
      try {
        setSavingId(
          id
        );

        const target =
          inventory.find(
            (i) =>
              i.id === id
          );

        if (
          !target
        ) {
          return;
        }

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
                  id,
                  actualQuantity,
                }
              ),
          }
        );

        setRecentItems(
          (
            prev
          ) => [
            target,
            ...prev.filter(
              (
                i
              ) =>
                i.id !==
                target.id
            ),
          ].slice(
            0,
            10
          )
        );

        setMessage(
          "保存完了"
        );

        await fetchInventory();

        setSelectedItem(
          null
        );

        setSearch("");

        setTimeout(
          () => {
            setMessage(
              ""
            );
          },
          1500
        );
              } catch (
        error
      ) {
        console.error(
          error
        );

        setMessage(
          "保存失敗"
        );
      } finally {
        setSavingId(
          ""
        );
      }
    };

  return (
    <div className="p-8 max-w-7xl mx-auto">

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold">
          棚卸
        </h1>

        {message && (
          <div
            className={`px-4 py-2 rounded ${
              message ===
              "保存完了"
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {message}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">

        <div className="border rounded-xl p-4 bg-white">
          <div className="text-sm text-gray-500">
            棚卸対象
          </div>

          <div className="text-4xl font-bold">
            {inventory.length}
          </div>
        </div>

        <div className="border rounded-xl p-4 bg-white">
          <div className="text-sm text-gray-500">
            完了
          </div>

          <div className="text-4xl font-bold text-green-600">
            {completed}
          </div>
        </div>

        <div className="border rounded-xl p-4 bg-white">
          <div className="text-sm text-gray-500">
            未完了
          </div>

          <div className="text-4xl font-bold text-red-600">
            {pending}
          </div>
        </div>

        <div className="border rounded-xl p-4 bg-white">
          <div className="text-sm text-gray-500">
            完了率
          </div>

          <div className="text-4xl font-bold text-blue-600">
            {progress}%
          </div>
        </div>

        <div className="border rounded-xl p-4 bg-white">
          <div className="text-sm text-gray-500">
            差異あり
          </div>

          <div className="text-4xl font-bold text-orange-600">
            {differenceCount}
          </div>
        </div>

      </div>

      <div className="border rounded-xl bg-white p-6 mb-6">

        <input
  autoFocus
  type="text"
  value={search}
  onChange={(e) =>
    setSearch(
      e.target.value
    )
  }
  placeholder="JAN・管理番号・商品名"
  className="w-full border rounded-xl p-4 mb-4 text-xl"
/>

        <div className="grid md:grid-cols-2 gap-4">

          <button
            onClick={
              scannerOpen
                ? stopScanner
                : () =>
                    startScanner()
            }
            className="bg-blue-600 text-white rounded-xl p-5 text-xl font-bold"
          >
            {scannerOpen
              ? "停止"
              : "📷 棚卸開始"}
          </button>

          <button
            onClick={
              changeCamera
            }
            disabled={
              !scannerOpen
            }
            className="bg-gray-700 text-white rounded-xl p-5 text-xl font-bold disabled:bg-gray-400"
          >
            🔄 カメラ切替
          </button>

        </div>

      </div>

      {scannerOpen && (
        <div className="border rounded-xl bg-black p-4 mb-6">

          <div className="text-white mb-2">
            カメラ起動中
          </div>

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-[400px] rounded"
          />

        </div>
      )}

      {selectedItem && (
        <div className="border-2 border-blue-500 rounded-2xl bg-blue-50 p-6 mb-6">

          <div className="text-sm text-blue-600 mb-2">
            読み取り商品
          </div>

          <div className="text-3xl font-bold mb-4">
            {selectedItem.item.name}
          </div>

          <div className="grid md:grid-cols-4 gap-4 mb-6">

            <div>
              <div className="text-sm text-gray-500">
                管理番号
              </div>
              <div>
                {selectedItem.managementCode || "-"}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500">
                JAN
              </div>
              <div>
                {selectedItem.item.janCode || "-"}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500">
                保管場所
              </div>
              <div>
                {selectedItem.storageLocation?.name || "-"}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500">
                理論在庫
              </div>
              <div className="text-3xl font-bold">
                {selectedItem.quantity}
              </div>
            </div>

          </div>
                    <div className="flex gap-4">

            <input
              id="selected-qty"
              type="number"
              defaultValue={
                selectedItem.actualQuantity ??
                selectedItem.quantity
              }
              className="border rounded-xl p-4 flex-1 text-2xl"
            />

            <button
              onClick={() => {
                const input =
                  document.getElementById(
                    "selected-qty"
                  ) as HTMLInputElement;

                saveStocktake(
                  selectedItem.id,
                  Number(
                    input.value
                  )
                );
              }}
              disabled={
                savingId ===
                selectedItem.id
              }
              className="bg-green-600 text-white px-8 rounded-xl disabled:bg-gray-400"
            >
              {savingId ===
              selectedItem.id
                ? "保存中..."
                : "保存"}
            </button>

          </div>

        </div>
      )}

      {recentItems.length > 0 && (

        <div className="border rounded-xl bg-white p-4 mb-6">

          <h2 className="text-xl font-bold mb-4">
            最近棚卸した商品
          </h2>

          <div className="space-y-2">

            {recentItems.map(
              (item) => (

                <div
                  key={item.id}
                  className="flex justify-between border-b pb-2"
                >
                  <span>
                    {item.item.name}
                  </span>

                  <span className="text-gray-500">
                    {item.managementCode}
                  </span>

                </div>
              )
            )}

          </div>

        </div>
      )}

      <div className="border rounded-xl bg-white p-4 mb-4">

        <h2 className="text-xl font-bold mb-4">
          差異一覧
        </h2>

        <div className="space-y-2">

          {displayInventory
            .filter(
              (item) =>
                item.actualQuantity !==
                  null &&
                item.actualQuantity !==
                  undefined &&
                item.actualQuantity !==
                  item.quantity
            )
            .map(
              (item) => (

                <div
                  key={item.id}
                  className="border rounded p-3"
                >
                  <div className="font-bold">
                    {item.item.name}
                  </div>

                  <div className="text-sm text-gray-600">
                    理論:
                    {" "}
                    {item.quantity}
                    {" / "}
                    実棚:
                    {" "}
                    {item.actualQuantity}
                    {" / "}
                    差異:
                    {" "}
                    {getDifference(
                      item
                    )}
                  </div>

                </div>
              )
            )}

        </div>

      </div>

      <div className="space-y-4">

        {displayInventory.map(
          (item) => {

            const difference =
              getDifference(
                item
              );

            return (

              <div
                key={item.id}
                className="border rounded-xl bg-white p-4"
              >

                <div className="flex justify-between items-center mb-3">

                  <div className="font-bold text-xl">
                    {item.item.name}
                  </div>

                  <div>
                    {item.status ===
                    "checked"
                      ? "棚卸済"
                      : "未棚卸"}
                  </div>

                </div>

                <div className="grid md:grid-cols-4 gap-4">

                  <div>
                    <div className="text-sm text-gray-500">
                      管理番号
                    </div>
                    <div>
                      {item.managementCode || "-"}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-500">
                      JAN
                    </div>
                    <div>
                      {item.item.janCode || "-"}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-500">
                      理論在庫
                    </div>
                    <div>
                      {item.quantity}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-500">
                      差異
                    </div>
                    <div>
                      {difference ?? "-"}
                    </div>
                  </div>

                </div>

              </div>
            );
          }
        )}

        {displayInventory.length ===
          0 && (

          <div className="border rounded-xl bg-white p-10 text-center text-gray-500">

            商品がありません

          </div>
        )}

      </div>

    </div>
  );
}