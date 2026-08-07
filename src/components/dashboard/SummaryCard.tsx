type Props = {
  title: string;
  value: string | number;
  icon: string;
  color?: string;
};

export default function SummaryCard({
  title,
  value,
  icon,
  color = "bg-white",
}: Props) {
  return (
    <div
      className={`${color} rounded-2xl shadow border p-6 transition hover:shadow-lg`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-gray-500 text-sm">
            {title}
          </div>

          <div className="mt-2 text-3xl font-bold">
            {value}
          </div>
        </div>

        <div className="text-5xl">
          {icon}
        </div>
      </div>
    </div>
  );
}