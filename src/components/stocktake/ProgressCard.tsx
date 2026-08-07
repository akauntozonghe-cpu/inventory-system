type Props = {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
};

export default function ProgressCard({
  total,
  completed,
  remaining,
  percent,
}: Props) {
  return (
    <div className="space-y-5 rounded-xl border bg-white p-6 shadow">

      <h2 className="text-xl font-bold">
        📊 棚卸進捗
      </h2>

      <div className="grid gap-4 md:grid-cols-4">

        <div className="rounded-lg bg-slate-50 p-4 text-center">
          <div className="text-sm text-gray-500">
            対象商品
          </div>

          <div className="mt-2 text-3xl font-bold">
            {total}
          </div>
        </div>

        <div className="rounded-lg bg-green-50 p-4 text-center">
          <div className="text-sm text-green-700">
            完了
          </div>

          <div className="mt-2 text-3xl font-bold text-green-700">
            {completed}
          </div>
        </div>

        <div className="rounded-lg bg-yellow-50 p-4 text-center">
          <div className="text-sm text-yellow-700">
            残り
          </div>

          <div className="mt-2 text-3xl font-bold text-yellow-700">
            {remaining}
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 p-4 text-center">
          <div className="text-sm text-blue-700">
            進捗率
          </div>

          <div className="mt-2 text-3xl font-bold text-blue-700">
            {percent.toFixed(1)}%
          </div>
        </div>

      </div>

      <div>

        <div className="mb-2 flex justify-between text-sm font-semibold">
          <span>進捗</span>
          <span>{percent.toFixed(1)}%</span>
        </div>

        <div className="h-4 overflow-hidden rounded-full bg-gray-200">

          <div
            className="h-full rounded-full bg-green-600 transition-all duration-500"
            style={{
              width: `${Math.min(percent, 100)}%`,
            }}
          />

        </div>

      </div>

      {percent >= 100 && (
        <div className="rounded-lg bg-green-100 p-4 text-center font-bold text-green-700">
          🎉 棚卸が完了しました！
        </div>
      )}

    </div>
  );
}