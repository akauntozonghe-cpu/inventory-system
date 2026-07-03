"use client";

import { useEffect, useState } from "react";

type History = {
  id: string;

  changeQuantity: number;

  action: string;

  createdAt: string;

  inventoryInstance: {
    item: {
      name: string;
    };
  };
};

export default function HistoryPage() {
  const [histories, setHistories] =
    useState<History[]>([]);

  const fetchHistories = async () => {
    const res =
      await fetch("/api/history");

    const data = await res.json();

    setHistories(data);
  };

  useEffect(() => {
    fetchHistories();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">
        履歴
      </h1>

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
                </td>

                <td className="p-3 border-b">
                  {
                    history.changeQuantity
                  }
                </td>

                <td className="p-3 border-b">
                  {history.action}
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