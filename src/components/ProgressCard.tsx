"use client";

type Props = {
  completed: number;
  total: number;
};

export default function ProgressCard({
  completed,
  total,
}: Props) {

  const percent =
    total === 0
      ? 0
      : Math.round(
          (completed / total) * 100
        );

  return (
    <div className="bg-white rounded-xl shadow p-6">

      <div className="flex justify-between items-center mb-4">

        <div>

          <div className="text-sm text-gray-500">
            棚卸進捗
          </div>

          <div className="text-3xl font-bold">
            {completed} / {total}
          </div>

        </div>

        <div className="text-2xl font-bold text-blue-600">
          {percent}%
        </div>

      </div>

      <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">

        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{
            width: `${percent}%`,
          }}
        />

      </div>

    </div>
  );
}