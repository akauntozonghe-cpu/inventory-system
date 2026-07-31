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
    <div className="border rounded-xl p-6 shadow bg-white">
      <h2 className="text-xl font-bold mb-4">
        📊 棚卸進捗
      </h2>

      <div className="space-y-2">
        <p>
          <strong>全商品：</strong>
          {total}件
        </p>

        <p>
          <strong>棚卸済：</strong>
          {completed}件
        </p>

        <p>
          <strong>残り：</strong>
          {remaining}件
        </p>

        <p>
          <strong>進捗率：</strong>
          {percent}%
        </p>

        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className="bg-green-500 h-4 transition-all duration-300"
            style={{
              width: `${percent}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}