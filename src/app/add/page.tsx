"use client";

import { useEffect, useState } from "react";

type Location = {
  id: string;

  name: string;
};

export default function AddPage() {
  const [name, setName] =
    useState("");

  const [quantity, setQuantity] =
    useState(0);

  const [locations, setLocations] =
    useState<Location[]>([]);

  const [
    storageLocationId,
    setStorageLocationId,
  ] = useState("");

  const fetchLocations =
    async () => {
      const res =
        await fetch(
          "/api/storage-locations"
        );

      const data =
        await res.json();

      setLocations(data);
    };

  useEffect(() => {
    fetchLocations();
  }, []);

  const createInventory =
    async () => {
      const itemRes =
        await fetch("/api/items", {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            name,
          }),
        });

      const item =
        await itemRes.json();

      await fetch("/api/inventory", {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          itemId: item.id,

          quantity,

          allocationType: "home",

          storageLocationId,
        }),
      });

      alert("追加完了");

      setName("");
      setQuantity(0);

      fetchLocations();
    };

  return (
    <div className="p-8 max-w-md">
      <h1 className="text-3xl font-bold mb-8">
        商品追加
      </h1>

      <div className="space-y-4">
        <input
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
          placeholder="商品名"
          className="border p-2 w-full rounded"
        />

        <input
          type="number"
          value={quantity}
          onChange={(e) =>
            setQuantity(
              Number(e.target.value)
            )
          }
          placeholder="数量"
          className="border p-2 w-full rounded"
        />

        <select
          value={storageLocationId}
          onChange={(e) =>
            setStorageLocationId(
              e.target.value
            )
          }
          className="border p-2 w-full rounded"
        >
          <option value="">
            保管場所選択
          </option>

          {locations.map(
            (location) => (
              <option
                key={location.id}
                value={location.id}
              >
                {location.name}
              </option>
            )
          )}
        </select>

        <button
          onClick={createInventory}
          className="bg-blue-500 text-white px-4 py-2 rounded w-full"
        >
          追加
        </button>
      </div>
    </div>
  );
}