"use client";

type Props = {
  user?: string;
};

export default function DashboardHeader({
  user = "管理者",
}: Props) {
  const now = new Date();

  return (
    <div className="mb-8 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white shadow-lg">

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">

        <div>

          <h1 className="text-4xl font-bold">
            📦 Inventory OS
          </h1>

          <p className="mt-2 text-blue-100">
            在庫管理システム Version 1.0
          </p>

        </div>

        <div className="text-right">

          <div className="text-sm text-blue-100">
            ログイン
          </div>

          <div className="text-xl font-bold">
            👤 {user}
          </div>

          <div className="mt-2 text-sm">
            {now.toLocaleString("ja-JP")}
          </div>

        </div>

      </div>

    </div>
  );
}