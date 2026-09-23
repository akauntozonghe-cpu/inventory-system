"use client";
import {useLiveRefresh} from "@/hooks/useLiveRefresh";
import {fetchFresh} from "@/lib/fetch-fresh";

import Link from "@/components/auth/PermissionLink";
import { useEffect, useState } from "react";
import { displayActionLabel } from "@/lib/display-labels";

type History = {
  id: string;

  changeQuantity: number;

  action: string;

  createdAt: string;

  inventoryInstance: {
    id: string; lotNo: string | null; expirationDate: string | null; majorCategory: string | null; minorCategory: string | null; storageLocation: {name:string} | null;
    item: {
      id: string; name: string; janCode: string | null; systemBarcode: string | null;
    };
  };
};

export default function HistoryPage() {
  const [histories, setHistories] =
    useState<History[]>([]);

  const fetchHistories = async () => {
    const res =
      await fetchFresh("/api/history" + window.location.search);

    if(!res.ok)throw new Error("HISTORY_FETCH_FAILED");
    const data = await res.json();

    setHistories(data);
  };

  useEffect(() => {
    void fetchHistories().catch(()=>{});
  }, []);

  const syncFailed=useLiveRefresh(fetchHistories);
  return (
    <div className="p-8">
      {syncFailed&&<p role="alert">HISTORY_SYNC_FAILED：履歴の更新を確認できませんでした。</p>}
      <h1 className="text-3xl font-bold mb-8">
        履歴
      </h1>

      <Link href="/items" className="mb-4 inline-block underline">在庫一覧へ</Link>
      <div className="border rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-3 border-b">
                商品
              </th>

              <th className="text-left p-3 border-b">
                変動数
              </th>

              <th className="text-left p-3 border-b">
                操作
              </th>

              <th className="text-left p-3 border-b">
                日時
              </th>
            </tr>
          </thead>

          <tbody>
            {histories.map((history) => (
              <tr key={history.id}>
                <td className="p-3 border-b">
                  {
                    history
                      .inventoryInstance
                      .item.name
                  }
                  <p>JAN：{history.inventoryInstance.item.janCode || history.inventoryInstance.item.systemBarcode || "未設定"}</p>
                  <p>Lot：{history.inventoryInstance.lotNo || "未設定"} ／ 期限：{history.inventoryInstance.expirationDate?.slice(0,10) || "なし・未設定"} ／ 分類：{[history.inventoryInstance.majorCategory,history.inventoryInstance.minorCategory].filter(Boolean).join("・") || "未設定"} ／ 場所：{history.inventoryInstance.storageLocation?.name || "未設定"}</p>
                  <Link className="break-all underline" href={`/items/${history.inventoryInstance.item.id}?inventoryId=${encodeURIComponent(history.inventoryInstance.id)}`}>在庫No.：{history.inventoryInstance.id}の明細へ</Link>
                </td>

                <td className="p-3 border-b">
                  {
                    history.changeQuantity
                  }
                </td>

                <td className="p-3 border-b">
                  {displayActionLabel(history.action)}
                </td>

                <td className="p-3 border-b">
                  {new Date(
                    history.createdAt
                  ).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
