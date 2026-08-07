type Props = {
  percent: number;
};

export default function ProgressSummary({
  percent,
}: Props) {
  return (
    <div className="rounded-2xl border bg-white shadow p-6">

      <div className="flex justify-between mb-3">

        <h2 className="text-xl font-bold">
          📊 棚卸進捗
        </h2>

        <span className="font-bold">
          {percent}%
        </span>

      </div>

      <div className="h-5 rounded-full bg-gray-200 overflow-hidden">

        <div
          className="h-full bg-green-600 transition-all"
          style={{
            width: `${percent}%`,
          }}
        />

      </div>

    </div>
  );
}