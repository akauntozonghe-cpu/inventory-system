"use client";

import { useState } from "react";

export default function ImportPage() {
  const [file, setFile] =
    useState<File | null>(null);

  const importCsv = async () => {
    if (!file) return;

    const buffer =
      await file.arrayBuffer();

    const decoder =
      new TextDecoder("shift-jis");

    const text =
      decoder.decode(buffer);

    const rows =
      text.split("\n");

    for (const row of rows.slice(1)) {
      if (!row.trim()) continue;

      const columns =
        row.split(",");

      const managementCode =
        columns[0]?.trim();

      const managementGroupCode =
        columns[1]?.trim();

      const locationName =
        columns[2]?.trim();

      const majorCategory =
        columns[3]?.trim();

      const minorCategory =
        columns[4]?.trim();

      const janCode =
        columns[5]?.trim();

      const manufacturer =
        columns[7]?.trim();

      const name =
        columns[8]?.trim();

      const lotNo =
        columns[9]?.trim();

      const expirationDate =
        columns[10]?.trim();

      const unit =
        columns[11]?.trim();

      if (
        !name ||
        name === "品名"
      ) {
        continue;
      }

      let storageLocationId:
        | string
        | undefined;

      if (locationName) {
        const locationRes =
          await fetch(
            "/api/storage-locations",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                name: locationName,
              }),
            }
          );

        const location =
          await locationRes.json();

        storageLocationId =
          location.id;
      }

      const itemRes =
        await fetch("/api/items", {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            managementCode,

            managementGroupCode,

            janCode,

            name,

            manufacturer,

            majorCategory,

            minorCategory,

            defaultUnit:
              unit,
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

          quantity: 1,

          allocationType:
            "home",

          storageLocationId,

          managementCode,

          managementGroupCode,

          lotNo,

          expirationDate,

          unit,
        }),
      });
    }

    alert("インポート完了");
  };

  return (
    <div className="p-8 max-w-md">
      <h1 className="text-3xl font-bold mb-8">
        CSVインポート
      </h1>

      <input
        type="file"
        accept=".csv"
        onChange={(e) =>
          setFile(
            e.target.files?.[0] ??
              null
          )
        }
      />

      <button
        onClick={importCsv}
        className="bg-blue-500 text-white px-4 py-2 rounded mt-4"
      >
        インポート
      </button>
    </div>
  );
}