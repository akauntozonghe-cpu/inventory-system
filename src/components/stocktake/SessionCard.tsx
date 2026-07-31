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
  return (
    <div className="border rounded-xl p-5 shadow bg-white">
      <h1 className="text-3xl font-bold">{title}</h1>

      <div className="mt-4 space-y-1">
        <p>
          <span className="font-semibold">担当者：</span>
          {operator}
        </p>

        <p>
          <span className="font-semibold">状態：</span>
          {status}
        </p>

        <p>
          <span className="font-semibold">開始日時：</span>
          {new Date(createdAt).toLocaleString("ja-JP")}
        </p>
      </div>
    </div>
  );
}