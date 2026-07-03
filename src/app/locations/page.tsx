"use client";

import { useEffect, useState } from "react";

type Location = {
  id: string;

  name: string;

  description?: string;
};

export default function LocationsPage() {
  const [locations, setLocations] =
    useState<Location[]>([]);

  const [name, setName] =
    useState("");

  const [description, setDescription] =
    useState("");

  const fetchLocations = async () => {
    const res =
      await fetch(
        "/api/storage-locations"
      );

    const data = await res.json();

    setLocations(data);
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const createLocation =
    async () => {
      await fetch(
        "/api/storage-locations",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            name,
            description,
          }),
        }
      );

      setName("");
      setDescription("");

      fetchLocations();
    };

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-3xl font-bold mb-8">
        保管場所管理
      </h1>

      <div className="space-y-4 mb-8">
        <input
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
          placeholder="場所名"
          className="border p-2 rounded w-full"
        />

        <input
          value={description}
          onChange={(e) =>
            setDescription(
              e.target.value
            )
          }
          placeholder="説明"
          className="border p-2 rounded w-full"
        />

        <button
          onClick={createLocation}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          追加
        </button>
      </div>

      <div className="space-y-2">
        {locations.map((location) => (
          <div
            key={location.id}
            className="border rounded p-4"
          >
            <div className="font-bold">
              {location.name}
            </div>

            <div className="text-sm text-gray-500">
              {location.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}