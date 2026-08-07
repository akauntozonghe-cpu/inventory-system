type Props = {
  title: string;
  operator: string;
  status: string;
  createdAt: string;
};

export default function SessionCard({
  title,
  operator,
  status,
  createdAt,
}: Props) {
  const statusInfo = {
    IN_PROGRESS: {
      label: "進行中",
      color: "bg-blue-100 text-blue-700",
    },
    PAUSED: {
      label: "一時停止",
      color: "bg-yellow-100 text-yellow-700",
    },
    COMPLETED: {
      label: "完了",
      color: "bg-green-100 text-green-700",
    },
  } as const;

  const currentStatus =
    statusInfo[
      status as keyof typeof statusInfo
    ] ?? {
      label: status,
      color: "bg-gray-100 text-gray-700",
    };

  return (
    <div className="rounded-xl border bg-white p-6 shadow">

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

        <div>

          <h1 className="text-2xl font-bold">
            {title}
          </h1>

          <p className="mt-2 text-gray-500">
            棚卸セッション情報
          </p>

        </div>

        <span
          className={`rounded-full px-4 py-2 text-sm font-bold ${currentStatus.color}`}
        >
          {currentStatus.label}
        </span>

      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">

        <div className="rounded-lg bg-slate-50 p-4">

          <div className="text-sm text-gray-500">
            担当者
          </div>

          <div className="mt-1 text-lg font-semibold">
            {operator}
          </div>

        </div>

        <div className="rounded-lg bg-slate-50 p-4">

          <div className="text-sm text-gray-500">
            開始日時
          </div>

          <div className="mt-1 text-lg font-semibold">
            {new Date(createdAt).toLocaleString(
              "ja-JP"
            )}
          </div>

        </div>

      </div>

    </div>
  );
}