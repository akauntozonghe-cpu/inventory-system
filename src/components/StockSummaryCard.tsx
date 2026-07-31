"use client";

type Props = {
  totalStock: number;
  homeStock: number;
  fleaMarketStock: number;
  warehouseStock: number;
  locationCount: number;
};

export default function StockSummaryCard({
  totalStock,
  homeStock,
  fleaMarketStock,
  warehouseStock,
  locationCount,
}: Props) {
  return (
    <div className="grid lg:grid-cols-5 gap-5">

      <SummaryCard
        title="総在庫"
        value={totalStock}
        color="text-blue-600"
      />

      <SummaryCard
        title="家在庫"
        value={homeStock}
        color="text-orange-500"
      />

      <SummaryCard
        title="フリマ在庫"
        value={fleaMarketStock}
        color="text-purple-600"
      />

      <SummaryCard
        title="倉庫在庫"
        value={warehouseStock}
        color="text-green-600"
      />

      <SummaryCard
        title="保管場所"
        value={locationCount}
        color="text-slate-700"
      />

    </div>
  );
}

type CardProps = {
  title: string;
  value: number;
  color: string;
};

function SummaryCard({
  title,
  value,
  color,
}: CardProps) {
  return (
    <div className="bg-white rounded-xl shadow p-6">

      <p className="text-gray-500 text-sm">
        {title}
      </p>

      <h2 className={`text-4xl font-bold mt-3 ${color}`}>
        {value}
      </h2>

    </div>
  );
}