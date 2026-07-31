"use client";

type History = {
  id: string;
  action: string;
  changeQuantity: number;
  createdAt: string;
};

type Props = {
  histories: History[];
};

export default function HistoryCard({
  histories,
}: Props) {
  return (
    <div className="bg-white rounded-xl shadow p-6">

      <div className="flex items-center justify-between mb-6">

        <h2 className="text-xl font-bold">
          在庫履歴
        </h2>

        <span className="text-sm text-gray-500">
          {histories.length}件
        </span>

      </div>

      {histories.length === 0 ? (

        <div className="text-center py-12 text-gray-500">
          履歴はありません
        </div>

      ) : (

        <div className="space-y-3">

          {histories.map((history) => (

            <div
              key={history.id}
              className="border rounded-lg p-4 hover:bg-slate-50"
            >

              <div className="flex justify-between">

                <div>

                  <p className="font-semibold">

                    {history.action}

                  </p>

                  <p className="text-sm text-gray-500">

                    {new Date(
                      history.createdAt
                    ).toLocaleString("ja-JP")}

                  </p>

                </div>

                <div
                  className={`text-lg font-bold ${
                    history.changeQuantity >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >

                  {history.changeQuantity >= 0 ? "+" : ""}

                  {history.changeQuantity}

                </div>

              </div>

            </div>

          ))}

        </div>

      )}

    </div>
  );
}