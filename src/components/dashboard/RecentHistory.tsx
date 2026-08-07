import { DashboardData } from "@/types/dashboard";

type Props = {
  histories: DashboardData["recentHistories"];
};

export default function RecentHistory({
  histories,
}: Props) {
  return (
    <div className="rounded-2xl border bg-white shadow p-6">

      <h2 className="mb-5 text-xl font-bold">
        📝 最近の履歴
      </h2>

      <div className="space-y-3">

        {histories.length === 0 && (
          <div className="text-gray-500">
            履歴がありません
          </div>
        )}

        {histories.map((history) => (
          <div
            key={history.id}
            className="flex justify-between rounded-lg border p-3"
          >
            <div>
              <div className="font-semibold">
                {history.inventoryInstance.item.name}
              </div>

              <div className="text-sm text-gray-500">
                {history.action}
              </div>
            </div>

            <div className="text-right">

              <div className="font-bold">
                {history.changeQuantity > 0
                  ? "+"
                  : ""}
                {history.changeQuantity}
              </div>

              <div className="text-xs text-gray-400">
                {new Date(
                  history.createdAt
                ).toLocaleString("ja-JP")}
              </div>

            </div>
          </div>
        ))}

      </div>

    </div>
  );
}