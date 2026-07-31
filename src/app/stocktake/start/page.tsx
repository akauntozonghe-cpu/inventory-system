"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StorageLocation = {
  id: string;
  name: string;
};

export default function StocktakeStartPage() {

  const router = useRouter();

  const [locations, setLocations] =
    useState<StorageLocation[]>([]);

  const [locationId, setLocationId] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    async function load() {

      try {

        const res =
          await fetch("/api/storage-locations");

        const data =
          await res.json();

        setLocations(data);

        if (data.length > 0) {

          setLocationId(data[0].id);

        }

      } finally {

        setLoading(false);

      }

    }

    load();

  }, []);

  function startStocktake() {

    if (!locationId) {

      alert("保管場所を選択してください");

      return;

    }

    router.push(
      `/stocktake?locationId=${locationId}`
    );

  }

  if (loading) {

    return (

      <div className="p-10">

        読み込み中...

      </div>

    );

  }

  return (

    <div className="max-w-xl mx-auto p-8">

      <h1 className="text-4xl font-bold mb-8">

        初回棚卸

      </h1>

      <div className="bg-white rounded-2xl shadow p-8">

        <div className="space-y-6">

          <div>

            <label className="block mb-2 font-semibold">

              保管場所

            </label>

            <select

              value={locationId}

              onChange={(e)=>

                setLocationId(
                  e.target.value
                )

              }

              className="border rounded-lg p-3 w-full"

            >

              {locations.map((location)=>(

                <option

                  key={location.id}

                  value={location.id}

                >

                  {location.name}

                </option>

              ))}

            </select>

          </div>

          <button

            onClick={startStocktake}

            className="bg-blue-600 text-white rounded-xl py-4 w-full text-lg"

          >

            棚卸開始

          </button>

        </div>

      </div>

    </div>

  );

}