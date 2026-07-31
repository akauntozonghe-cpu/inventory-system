"use client";

type Props = {
  onReceive?: () => void;
  onShip?: () => void;
  onMove?: () => void;
  onHome?: () => void;
  onFleaMarket?: () => void;
  onStocktake?: () => void;
};

export default function QuickActions({
  onReceive,
  onShip,
  onMove,
  onHome,
  onFleaMarket,
  onStocktake,
}: Props) {
  return (
    <div className="bg-white rounded-xl shadow p-6">

      <div className="flex items-center justify-between mb-6">

        <h2 className="text-xl font-bold">
          クイック操作
        </h2>

      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

        <ActionButton
          title="📦 入庫"
          color="bg-green-600 hover:bg-green-700"
          onClick={onReceive}
        />

        <ActionButton
          title="📤 出庫"
          color="bg-red-600 hover:bg-red-700"
          onClick={onShip}
        />

        <ActionButton
          title="🔄 在庫移動"
          color="bg-blue-600 hover:bg-blue-700"
          onClick={onMove}
        />

        <ActionButton
          title="🏠 家在庫へ"
          color="bg-orange-500 hover:bg-orange-600"
          onClick={onHome}
        />

        <ActionButton
          title="🛒 フリマ在庫へ"
          color="bg-purple-600 hover:bg-purple-700"
          onClick={onFleaMarket}
        />

        <ActionButton
          title="📋 棚卸開始"
          color="bg-cyan-600 hover:bg-cyan-700"
          onClick={onStocktake}
        />

      </div>

    </div>
  );
}

type ButtonProps = {
  title: string;
  color: string;
  onClick?: () => void;
};

function ActionButton({
  title,
  color,
  onClick,
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`${color} rounded-xl text-white p-5 font-semibold transition`}
    >
      {title}
    </button>
  );
}