"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

export default function ImportPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function importExcel(file: File) {
    try {
      setLoading(true);
      setMessage("");

      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
      });

      // 管理表シート
      const sheet = workbook.Sheets["管理表"];

      if (!sheet) {
        setMessage("管理表シートが見つかりません");
        return;
      }

      // ★2行目をヘッダーとして読む
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        sheet,
        {
          raw: false,
          defval: "",
          range: 1,
        }
      );

      console.log("シート一覧", workbook.SheetNames);
      console.log("読み込み件数", rows.length);
      console.log("1行目", rows[0]);
      console.log("列名", Object.keys(rows[0] ?? {}));

      const inventories = rows
        .filter((row) => {
          return (
            String(row["品名"] ?? "").trim() !== ""
          );
        })
        .map((row) => ({
          storageLocation: String(
            row["保管場所"] ?? ""
          ).trim(),

          managementCode: String(
            row["管理コード"] ?? ""
          ).trim(),

          managementGroupCode: String(
            row["管理区分"] ?? ""
          ).trim(),

          manufacturer: String(
            row["会社名"] ?? ""
          ).trim(),

          majorCategory: String(
            row["大分類"] ?? ""
          ).trim(),

          minorCategory: String(
            row["小分類"] ?? ""
          ).trim(),

          janCode: String(
            row["JANコード"] ?? ""
          ).trim(),

          name: String(
            row["品名"] ?? ""
          ).trim(),

          lotNo: String(
            row["Lot.No・製造番号"] ?? ""
          ).trim(),

          expirationDate: String(
            row["期限"] ?? ""
          ).trim(),

          quantity: Number(
            row["個数"] ?? 0
          ),

          unit: String(
            row["個数単位"] ?? "個"
          ).trim(),
        }));

      console.log(
        "登録件数",
        inventories.length
      );

      const res = await fetch(
        "/api/import",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            inventories,
          }),
        }
      );

      const result =
        await res.json();

      if (!res.ok) {
        throw new Error(
          result.message
        );
      }

      setMessage(
        `${result.created}件インポートしました`
      );

    } catch (error) {
      console.error(error);
      setMessage("インポート失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-8">

      <h1 className="text-4xl font-bold mb-8">
        初回インポート
      </h1>

      <div className="bg-white rounded-xl shadow p-8">

        <div className="space-y-6">

          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const file =
                e.target.files?.[0];

              if (file) {
                importExcel(file);
              }
            }}
            className="border rounded-lg p-3 w-full"
          />

          {loading && (
            <div className="rounded-lg bg-blue-100 p-4">
              インポート中...
            </div>
          )}

          {!loading && message && (
            <div className="rounded-lg bg-green-100 p-4">
              {message}
            </div>
          )}

          <div className="rounded-lg bg-gray-50 border p-4 text-sm text-gray-600">

            <div className="font-bold mb-2">
              読み込み対象
            </div>

            <ul className="list-disc ml-5 space-y-1">
              <li>管理表シート</li>
              <li>保管場所</li>
              <li>会社名</li>
              <li>大分類</li>
              <li>小分類</li>
              <li>JANコード</li>
              <li>品名</li>
              <li>Lot.No・製造番号</li>
              <li>期限</li>
              <li>個数</li>
              <li>個数単位</li>
            </ul>

          </div>

        </div>

      </div>

    </div>
  );
}