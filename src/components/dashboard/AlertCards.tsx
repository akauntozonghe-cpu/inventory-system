type Props = {
  difference: number;
  expired: number;
  shortage: number;
};

export default function AlertCards({
  difference,
  expired,
  shortage,
}: Props) {
  const cards = [
    {
      title: "差異",
      value: difference,
      icon: "⚠️",
      color: "bg-red-50",
    },
    {
      title: "期限切れ",
      value: expired,
      icon: "⏰",
      color: "bg-yellow-50",
    },
    {
      title: "在庫不足",
      value: shortage,
      icon: "📉",
      color: "bg-orange-50",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`${card.color} rounded-2xl border p-5 shadow`}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="text-gray-500">
                {card.title}
              </div>

              <div className="mt-2 text-3xl font-bold">
                {card.value}
              </div>
            </div>

            <div className="text-5xl">
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}